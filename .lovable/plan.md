
# Send-chain regression audit — 2026-05-19 → 2026-05-20 (GST)

## 1. Executive summary

The send chain is **not broken** — it is dispatching every minute and rows are moving `scheduled → sent`. Today's hourly throughput (147 / 180 / 59 in 11–13 GST) is in the same band as yesterday's busy hours.

What changed is **effective per-workspace throughput**, and it has a clear cause: the combination of yesterday's two safe fixes — the 20 s cron timeout (good) and the new `claim_due_campaign_recipients` ordering (regression candidate) — means each cron tick can only send **one row per WhatsApp number per minute**, regardless of `p_limit=30`, because in `mode=cron` subsequent rows for the same sender skip on `pacing_gap` instead of sleeping.

So:
- Yesterday's incident fixes did **not** disable sending.
- They did silently cap the dispatcher at **≈ N rows/minute, where N = number of distinct due senders globally**.
- FB Media (2 senders) and fitpreneur (3 senders) are starving when goflow / Undergroundecom backlogs share the same minute, because the `picked` CTE returns ranks 1..5 per sender, but only rank 1 actually sends in cron mode — the other 24 of the 30 claimed slots are wasted on `pacing_gap` skips.

This is **slower-by-design from yesterday's pacing change**, not a new bug, not a disabled job, not a cron failure.

## 2. Yesterday vs now — change inventory

Migrations on 2026-05-20 GST that touched the send chain:

| Time GST | Migration | What it did | Risk to send chain |
|---|---|---|---|
| 07:42 | `..._199eca27_..._job_locks` | Dropped + recreated `try_job_lock` / `release_job_lock`; TTL = 5 min | Neutral (later shortened) |
| 08:08 | `..._54c2bb8f_debug_cron_status` | Added `debug_cron_status()` view | None |
| 08:13 | `..._48c85916_..._job_lock_ttl_90s` | Cleared stale `campaigns-process` lock; TTL → **90 s** | Good — unblocks stuck ticks |
| 08:42 | `..._9c54c9f8_claim_due_campaign_recipients` | New `claim_due_campaign_recipients(p_limit=30)` ordered by `sender_rank ASC` then `id` | **Top regression candidate (pacing interaction)** |
| 09:19 / 09:23 | FB Media ownership swap + revert; `process-email-queue` restored | Email queue only — unrelated to WhatsApp send | None |

Cron command changes (already applied earlier in the day):
- `campaigns-process-every-min` and `lead-dispatch-every-min` now use `timeout_milliseconds := 20000` (previously default 5 s). Confirmed in `cron.job.command`.
- All 18 cron jobs are `active = true`. Nothing was unscheduled and forgotten.

Edge function changes in `campaigns/index.ts`:
- `processQueue` was split into `cron` vs `manual` mode. In `cron`:
  - `TICK_BUDGET_MS = 3500`
  - `perTickLimit = 30`
  - `pacing_gap` rows **skip instead of sleep** (lines 1162–1164).

Nothing else in the send chain (`send-whatsapp-template`, `whatsapp-webhook`, `lead-dispatch`, `follow-up-dispatch`) was modified in the incident window.

## 3. Top regression candidates (ranked)

1. **`claim_due_campaign_recipients` + cron pacing interaction (highest)**
   The function returns 30 rows ordered by `sender_rank ASC`. With only 6 distinct due senders globally right now (FB 2, fitpreneur 3, Sophias 1), a single tick claims ~30 rows = ranks 1..5 across 6 senders. In `cron` mode rows 2..5 per sender are 30 s behind the previous send for the same number, so they all skip with `pacing_gap`. Today's logs confirm: `sent=4 skips={pacing_gap:26,claimed:4}` and `sent=2 skips={pacing_gap:28,claimed:2}`.
2. **Cron tick cadence vs `delay_min_seconds=30`**
   Cron fires every 60 s. The 30 s `delay_min_seconds` could allow 2 sends per number per minute, but only one is ever sent because `lastSentMs` is an in-memory Map that resets on each cold start, *and* within a single tick the second row hits pacing_gap and skips. Net: hard cap of **1 send / number / minute**, no matter how large `p_limit` is.
3. **`campaign_dispatch_events` table is empty (no skip-reason persistence)**
   `[job:...] skips={pacing_gap:26,...}` only goes to function logs, never to the DB. There is currently no DB-side audit trail to attribute starvation per workspace or per number. This is why workspace owners experience "nothing is sending" — there is no row in the UI runtime panel explaining why.
4. **Two `running` FB Media campaigns with the same name and same `whatsapp_number_id`**
   Both compete for the single rank-1 slot for that number. Effective cap = 1/min shared across two campaigns. Not yesterday's fix, but it compounds the starvation symptom.

## 4. Shared bottleneck diagnosis

```text
cron fires every 60s
   |
   v
/functions/v1/campaigns?action=process (mode=cron, 20s timeout)  -> OK, always 200
   |
   v
RPC claim_due_campaign_recipients(30)
   |   returns up to 30 rows in (sender_rank ASC, id)
   v
processQueue per row:
   - if pacing minGap (30s) not satisfied AND cron mode -> SKIP pacing_gap
   - else atomic UPDATE status='scheduled' -> 'sending' -> send -> 'sent'
```

Effective dispatcher throughput is `min(p_limit, N_distinct_due_senders_globally)` per minute, **not** `p_limit`. That is the shared bottleneck. It is the same code path for every workspace, so when one workspace (goflow / Undergroundecom) finishes a burst, the bottleneck visibly "moves" to the next workspace (FB Media / fitpreneur), which feels client-specific but is not.

There is no provider backoff issue, no kill switch, no paused number, and no lock contention right now. `whatsapp_message_events` and inbound webhooks are flowing normally.

## 5. Smallest safe recovery action (proposal — not yet applied)

Pick exactly one of these. They are listed cheapest → most invasive. Each is independent.

**Option A — change only `claim_due_campaign_recipients` (recommended, smallest blast radius)**

Replace `row_number()` over the per-sender partition with `LIMIT 1 per sender` so the RPC returns only one (the oldest due) row per `whatsapp_number_id` per call. The dispatcher then sends exactly one row per due sender per tick and stops wasting 24/30 slots on pacing skips. `p_limit` becomes the cap on *distinct senders served per minute*, which is what we actually want.

This is reversible by re-running the 08:42 migration if anything regresses.

**Option B — same as A, but also raise cron cadence on `campaigns-process-every-min` to every 30 s**

Doubles per-sender throughput to ~2/min. Only safe after A, otherwise we just double the wasted `pacing_gap` skips and double cron HTTP load.

**Option C — keep claim function as-is, drop `pacing_gap` floor when cron mode and `delay_min_seconds < tick_cadence`**

More code, more reasoning surface in `processQueue`. Not recommended as the first move.

Recommendation: **Option A only**, deploy, watch for one hour, then decide whether to add B.

## 6. What should NOT be touched yet

- `try_job_lock` / `release_job_lock` — TTL=90s is fine, no stuck locks observed.
- `timeout_milliseconds := 20000` on the two cron HTTP calls — keep it.
- Sender routing, templates, Gupshup app/api key columns — confirmed healthy.
- `max_inflight_per_number` / `max_inflight_per_campaign` defaults (5 / 50) — not the bottleneck; raising them changes nothing until A is done.
- Webhook / inbound chain — healthy, dozens of `message-event` / `billing-event` callbacks per minute.
- `lead-dispatch` and `follow-up-dispatch` schedules — both active and logging cleanly.
- The duplicate FB Media campaign — leave for the workspace owner to merge / cancel; do not touch from the dispatcher side.
