
# Why this campaign looks "stuck at 34"

I traced the exact campaign on screen: `2026-05-19 | UK | Finance / Legal / Professional | iskra uk main | Call` (id `757eeb72…`, `dispatch_mode = marketing_instant`, `delay_min/max = 0`, `max_inflight_per_number = 200`, started 17:00 GST).

## What the DB actually shows right now (Dubai time)

Per-recipient state at ~17:32 GST:

| Number | sent | replied | sending (claimed, not delivered) | scheduled (queue) |
|---|---|---|---|---|
| Showtime David | 21 | 11 | 25 | 143 |
| Elena Morgan   |  9 | 18 | 141 | 32 |
| **TOTAL**      | **30** | **29** | **166** | **175** |

Events on `whatsapp_message_events` for this campaign:
- last `sent` event: **17:19:00 GST**
- last `enqueued`: 17:19:00 GST
- last `delivered`: 17:20:00 GST
- last `read`: 17:32:00 GST
- nothing else outbound after 17:19

Edge-function invocations of `campaigns`:
- last call: 17:24:55 GST, ran 20.7s and returned 200
- nothing for ~7 minutes after that

## Three separate bugs adding up to the symptom

**1. Cached counter under-counts.** `campaigns.sent_count = 34` but real "left the door" count is `sent(30) + replied(29) = 59`. The dispatcher only increments `sent_count` on status `'sent'`; when the webhook flips the row to `'replied'` first (very fast UK replies), the row never passes through "sent" cleanly, so the counter stalls. This is exactly the `campaign_live_counts.sent` bug we already patched server-side in Phase 0, but **the campaign card UI is still reading `campaigns.sent_count`**, not the RPC.

**2. 166 recipients are stuck in `sending`.** The cron tick claimed them (`status='scheduled' → 'sending'`) but no `enqueued`/`sent` event was ever written. With `marketing_instant` + delay 0, the tick spawns up to 200 parallel Gupshup calls per number; when the Deno isolate hits its 30s wall-clock or hits the per-tick 55s budget mid-flight, the in-memory promises are cancelled and the row is left in `sending` with no event. `reap_stuck_sending_recipients` only revives them **after 10 idle minutes** - and during that 10-minute window the next cron ticks won't re-claim them, so throughput collapses to zero. The 6-7 min "silent" gap you can see in the events log is exactly this.

**3. The cron itself appears to have skipped beats.** Last `campaigns` invocation was 17:24:55 GST. With `pg_cron` firing every minute we should have seen 17:26, 17:27, 17:28… invocations. None landed. Either the previous 20.7s tick blocked the cron worker, or the cron schedule is paused. Combined with bug 2, this leaves the queue frozen.

So the truthful answer to "is it only 34?":
- displayed 34 = stale, under-counted cached value
- real progress = 59 confirmed + 166 in-flight (most of which will eventually deliver once reap runs) + 175 still untouched
- the campaign is **alive but bleeding throughput**, not dead, not a bad number

## "Mark as not unread" — what it is and whether to keep it

It's the per-conversation action in CRM (`markUnread` in `src/pages/CRM.tsx:242`). It bumps a read conversation's `unread_count` back to ≥1 so the row resurfaces in the unread filter. Purpose: "I read this but I want to come back to it later". The label is just clumsy ("Mark as unread" reads as a double-negative next to "Mark as read"). It is **not** related to campaign sending in any way - it only touches `conversations.unread_count` in the inbox. You can keep it, rename it ("Mark as follow-up"), or hide it; it has no effect on the dispatcher.

# Plan

## Phase A - stop the bleeding on this exact campaign (do first, ~5 min)

A1. Run `select public.reap_stuck_sending_recipients(2);` once to bump anything idle in `sending > 2 min` back to `scheduled`. This unblocks the 166 frozen rows immediately on this campaign.

A2. Force a one-shot dispatcher kick by curling `POST /functions/v1/campaigns` with the cron-tick action so we don't wait for the next pg_cron minute.

A3. Re-read `campaign_live_counts(['757eeb72…'])` (now patched to include `replied` in `sent` and to surface `delivered_count`) and confirm the numbers match the DB - so we know the foundation works before we touch the UI.

No code changes in Phase A, just operations.

## Phase B - structural fix for `marketing_instant` stalls (next, ~1-2 h)

B1. **Shorten the reap interval for `marketing_instant` campaigns.** Add a per-mode argument: paced/utility stay at 10 min, marketing_instant at 2 min. Tiny SQL change to `reap_stuck_sending_recipients` (accept a mode filter) + dispatcher passes the shorter window first on every tick.

B2. **Cap the per-tick claim for `marketing_instant`** at something the isolate can actually finish in <30s (e.g. 60 sends per tick per number, not 200). The current `max_inflight_per_number=200` lets one tick claim everything and then choke. Throughput stays the same across the campaign because pg_cron fires every minute - we just stop creating 7-minute dead zones.

B3. **Wrap each per-recipient send in a guaranteed status-finaliser.** Today, if the Gupshup call throws or the isolate dies, the row remains `sending`. Use a `try/finally` that either writes a `failed` event with `error_code='dispatcher_aborted'` or hands the row back to `scheduled` before the function returns - so reap stops being the only safety net.

B4. **Health check on pg_cron.** Add a `cron_heartbeat` SELECT that the `Reconciliation` page surfaces: "last campaigns tick: 7 min ago" with an amber/red badge. Right now there is no visibility that the cron is even firing.

## Phase C - kill the counter lie in the UI (~30 min)

C1. **Stop reading `campaigns.sent_count` in the campaign card.** `CampaignRuntimePanel` already calls `campaign_live_counts` (which we patched in Phase 0); we just need the card header and the top-line `34/400` number to read `sent + delivered_count - duplicates` from the RPC, not the cached column.

C2. Add a small breakdown chip next to `Sent`: `sent · delivered · replied` (3 numbers), powered by the same RPC. Operator finally sees the truth without opening Reconciliation.

C3. Leave `campaigns.sent_count` in the DB - the dispatcher still needs it for per-day caps - but mark it `-- internal, do not display` in the migration comment, matching the Phase-2 plan.

## Phase D - "Mark as not unread" UX cleanup (~10 min)

D1. Rename the action to **"Mark for follow-up"** (sets `unread_count = max(1, prev)`), and add a tooltip "Resurface this chat in the Unread filter".

D2. Don't touch behaviour or schema. This is purely a label and tooltip change in `CRM.tsx`.

## What we are explicitly **not** doing in this round

- Rewriting `marketing_instant` to use a queue table or a Redis-style worker. Phase B fixes the stalls without that.
- Touching `send-whatsapp` rate limits or Gupshup retry policy - the issue is dispatcher claim/reap timing, not provider throughput.
- Building the partner earnings UI - still gated on Phase 1/2 from the main plan.

## Technical notes (for me, not the user)

- `reap_stuck_sending_recipients(p_idle_minutes int)` exists; needs an optional `p_dispatch_modes text[]` filter.
- `processQueue` in `supabase/functions/campaigns/index.ts:774` is the right place for the per-tick claim cap and the try/finally finaliser.
- The campaign-card top number lives in `src/components/workspace/CampaignRuntimePanel.tsx` and is currently fed by `campaigns.sent_count` via the parent's query; switch the consumer to the `campaign_live_counts` RPC row already being fetched in the same component.
- `markUnread` and its action button live in `src/pages/CRM.tsx:242` and the inbox row menu - rename in both spots.

Approve Phase A and I'll run it now (it's just two operational calls, no code), then we move into B/C/D.
