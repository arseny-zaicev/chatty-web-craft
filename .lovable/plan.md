## Root cause (verified in deployed runtime + live DB)

The deployed `campaigns` dispatcher path is actually correct for `marketing_instant`:
- `claim_due_campaign_recipients(120)` returns due rows fairly across senders.
- `processQueue` uses `INSTANT_TICK_LIMIT=120` when any instant row is due (peeked at L838-848).
- `floor=0`, `useConfiguredMin=false` for instant in cron mode (L1236-1238), so the `pacing_gap` skip path does **not** apply to instant.
- Worker pool / per-campaign semaphore / per-number cap are all sized for burst.

The real bottleneck is a **different cron job**: `supabase/functions/campaign-overflow-rebalance/index.ts`.

It runs every 30 minutes and:
1. Calls `campaign_overflow_clusters(_threshold:=50)` to find any `(campaign_id, scheduled_at)` pair with ≥50 scheduled rows on the same second.
2. Treats that as a bug fingerprint and respreads those rows **linearly across an 8-hour US business window (14:00-22:00 UTC) with ±30s jitter**.

That signature is *exactly* what a P0.6-correct `marketing_instant` launch produces — all 250 recipients stamped at one `blastStart` timestamp. So within 30 min of launch, the rebalance cron silently undoes P0.6 and converts a true burst into ~25 rows/hour for 8 hours ≈ **~0.4 sends/min per campaign**, which is what the operator perceives as "~3/min" across all live campaigns combined.

Proof from live DB (campaigns launched today at 10:45/10:47 UTC, `dispatch_mode='marketing_instant'`):

```
0b47d81a (Agency/Marketing): 14:00=14, 15:00=25, 16:00=25, 17:00=25, 18:00=25,
                              19:00=25, 20:00=25, 21:00=24, 22:00=1
9a2f39fa (Financial DMs):    14:00=15, 15:00=27, 16:00=26, 17:00=26, 18:00=25,
                              19:00=26, 20:00=27, 21:00=25, 22:00=1
```

Linear 8h spread starting 14:00 UTC = the exact rebalance fingerprint. The rows were correctly stamped at one moment on launch, then re-bucketed by the safety-net cron.

Dispatcher logs corroborate: on the tick after a bucket boundary, `selected=14 sent=2 skips={pacing_gap:12, claimed:2}` — only 14 rows due that minute (one bucket), 2 instant sent, 12 paced US rows correctly held by pacing_gap. Instant is bursting fine; there's just nothing to burst because the rebalance pre-spread them.

## Smallest safe fix

Two surgical changes, nothing else:

### 1. `supabase/functions/campaign-overflow-rebalance/index.ts`

Skip any cluster whose campaign is `dispatch_mode='marketing_instant'`. Same-second clusters are *intentional* for instant campaigns — they are the contract, not a bug.

Inside the per-cluster loop (L70+):
- After picking up `ids`, fetch `dispatch_mode` for `c.campaign_id`.
- If `marketing_instant`, `continue` (count as skipped in the digest, don't touch rows).
- Paced/utility/auth keep the existing respread behavior unchanged.

This preserves the original safety net for paced campaigns (the 2026-05-13 SMB incident it was built for) and stops it from fighting P0.6.

### 2. One-off repair migration (data only, no schema)

Re-collapse the two UK instant campaigns the rebalance already spread today:

```sql
UPDATE campaign_recipients
   SET scheduled_at = now()
 WHERE campaign_id IN (
   '9a2f39fa-a9ae-4eab-afec-efa50651806f',
   '0b47d81a-1e87-414b-afca-1845f21ecd5f'
 )
   AND status = 'scheduled'
   AND sent_at IS NULL;

UPDATE campaigns
   SET first_scheduled_at = now(),
       scheduled_start_at = now()
 WHERE id IN (
   '9a2f39fa-a9ae-4eab-afec-efa50651806f',
   '0b47d81a-1e87-414b-afca-1845f21ecd5f'
 );
```

Once #1 is deployed, the next rebalance tick will leave them alone and the dispatcher will drain them at `INSTANT_TICK_LIMIT=120/min` until the per-number/per-campaign caps and provider backoff naturally throttle.

## Out of scope (explicitly not touched)

- Dispatcher code path, cron cadence, `claim_due_campaign_recipients`, per-number/per-campaign caps, send settings, FE guardrails, paced rebalance behavior, anything in `whatsapp-webhook` or inbound.

## Verification after deploy

1. **Rebalance is inert for instant**: read `campaign-overflow-rebalance` next run log; `perCampaign` digest should not list the two UK campaign IDs even though they still have one big same-second cluster.
2. **Effective rate**: within 1-2 cron ticks after the repair, `sent` count on both UK campaigns should rise by tens per minute (bounded by `max_inflight_per_number` 209/300 and `max_inflight_per_campaign` 250/350), not by ~0-1/min.
3. **Distribution check**: re-run the same `date_trunc('hour', scheduled_at)` query — instead of 9 hourly buckets we should see one bucket at "now" that monotonically drains to zero.
4. **No regression on paced**: `bfc11a2f` (US Ss Notify Main) continues to drain at its configured 60-120s pacing, no change in its `pacing_gap` counters.

## Remaining caps still bounding burst (intentional, not removed in this step)

- `INSTANT_TICK_LIMIT = 120/min` (single throughput knob, P0.3 contract).
- `max_inflight_per_number` on each campaign (209 / 300 on the two UK ones).
- `max_inflight_per_campaign` (250 / 350).
- `whatsapp_numbers.daily_send_limit` safety net.
- Provider 429 backoff via `backoffByNum`.

These are the real provider-safety guardrails and are out of scope for this fix.
