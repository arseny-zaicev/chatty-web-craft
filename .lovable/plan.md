# Pre-launch CRM Audit

Scope: 17 numbers, 12 workspaces/pipelines, 41 campaigns (0 scheduled yet, 2 running first-touch), 4.4k audience rows, 149 conversations. Data integrity check: 0 orphan recipients, 0 deals/conversations missing workspace or pipeline, 0 active numbers without a workspace. Foundation is clean; the issues below are about behavior under multiplied load and a few correctness leaks.

## 1. P0 - Launch blockers

**P0-1. `processQueue` per-tick limit only counts `status='ready'` numbers.**
`supabase/functions/campaigns/index.ts` (~L700-707) computes `perTickLimit = max(50, count(status='ready') * 20)`. Today only 2 numbers are `ready`; 5 are `active`. So the global send ceiling per minute is **50**, not ~140. Once you schedule all clients, the queue will silently back up and `scheduled_at` will drift forward. Must include both `active` and `ready` (matches what `lead-dispatch` already does at L140).

**P0-2. `process-campaigns-every-minute` runs sequentially with sleeps up to 55s.**
`processQueue` awaits each send (sleeping until each recipient's randomized `scheduled_at`), so realistic throughput per tick is far below `perTickLimit`. With 12 pipelines turning on at once, second-half-of-window sends will stack. Either (a) shard work in parallel per `whatsapp_number_id`, or (b) drop the in-tick sleep and trust that the next tick will pick up due rows. Without one of these, scheduled batches over ~150-200/minute slip.

**P0-3. Duplicate Slack notification on first positive reply.**
A first positive reply enqueues **both** `positive_lead` (pipeline channel) and `lead.first_reply` (pipeline channel + mirrored to `delivery-leads`). Net effect: the client's pipeline channel gets the same reply twice, and `delivery-leads` still gets a copy - which is exactly the duplication the user just complained about for `positive_lead`. Either drop one of the two events for positive replies, or have `slack-dispatch` dedupe by `(conversation_id, last_message_text)` within a short window. Must fix before mass scheduling or every booked-meeting moment becomes Slack noise.

**P0-4. `lead-dispatch` "stuck queued recovery" can race with the campaigns worker.**
`lead-dispatch` reverts any `lead_imports.status='queued' && scheduled_at < now-10m && sent_at IS NULL` back to `pending`, marking the recipient `failed`. But `campaigns/processQueue` writes `sent_at` on `messages`, not on `lead_imports` - the lead's `sent_at` is only updated by the trigger that links recipient->lead. If that trigger lags, or if a recipient is in `sending` when the watchdog fires, we will (a) mark a live recipient as failed and (b) re-queue the same lead for a second send. Verify the trigger updates `lead_imports.sent_at` synchronously when `campaign_recipients.status` flips to `sent`, and exclude recipients whose status is `sending` or `sent` from the recovery sweep.

## 2. P1 - High-impact, do today

**P1-1. Inbox base query reads every inbound message for up to 200 conversations.**
`fetchCrmBase` does `select conversation_id from messages where direction='inbound' and conversation_id in (...200 ids)` with no limit. With 12 workspaces of ~2-5k inbound messages each, this becomes the slowest call on first inbox load. Replace with a `distinct conversation_id` aggregate (RPC) or denormalize a `has_inbound` flag on `conversations`.

**P1-2. `scheduled_at` index for the hot read path.**
`processQueue` filters `status='scheduled' AND scheduled_at <= horizon` ordered by `scheduled_at`. The closest existing index is `idx_campaign_recipients_queue` - confirm it covers `(status, scheduled_at)`; if not, add it. At today's volume it is fine; once 12 pipelines schedule, the queue will be the hottest table.

**P1-3. Per-campaign progress recompute is N+1 per tick.**
After each tick, `processQueue` issues 3 count queries per distinct `campaign_id` it touched. With many parallel first-touch siblings (one per number per pipeline per day), that is 3 * (numbers * pipelines) counts/minute. Replace with a single grouped aggregate, or only recompute the campaigns that actually had a state change.

**P1-4. `total_recipients` bump in `lead-dispatch` is also N+1 with read-modify-write.**
Read current value, then update - racy if two ticks overlap. Use `update ... set total_recipients = total_recipients + n`.

**P1-5. Realtime fan-out scope.**
The `Authenticated users can receive realtime` SELECT policy on `messages` is `USING (true)` - every signed-in user sees every message change on the realtime channel before client-side filtering. Today (~20 internal users) this is acceptable; once clients log in concurrently it is both a perf and a leak risk. Constrain via the workspace-member predicate (same as the SELECT policy below it).

**P1-6. Single-pipeline-per-workspace assumption.**
12 workspaces, 12 pipelines (1:1). The lead-dispatch loop pulls **all** pending leads with one `lead_imports` scan and then loops pipelines sequentially. Fine today; once any workspace adds a second pipeline, dispatch latency for the second one grows linearly. Consider parallelizing the per-pipeline loop (Promise.all with a small concurrency cap).

**P1-7. Campaign launch uses single immediate-send fallback.**
`campaigns/index.ts` calls `processQueue` immediately after creating a campaign. If two operators launch at the same minute, both immediate calls + the cron tick all race for the same rows - safe because of the `update ... where status='scheduled' returning` lock, but it does waste one tick. Add a 1-second jitter or skip the immediate call if cron will fire within 5s.

## 3. P2 - Defer

- Per-number cap rebalancing across siblings (today the round-robin in `lead-dispatch` is fine).
- `gupshup-mail-poll` 5-min cadence.
- `numbers-health-digest` content polish.
- TZ table in `campaigns/index.ts` (rough country->TZ map) - acceptable for this rollout.
- `slack-dispatch` 5-min sibling-grouping window for campaign events (small UX nit when launches straddle the boundary).

## 4. Implementation order

1. P0-1 - one-line fix in `processQueue`: include `status in ('active','ready')`. Lowest risk, biggest throughput unlock.
2. P0-3 - decide which event wins for positive first replies, drop the other. Confirm `delivery-leads` still gets it once.
3. P0-4 - tighten the stuck-queue recovery: exclude `sending`/`sent` recipients; verify the lead.sent_at trigger.
4. P0-2 - parallelize `processQueue` per number (or drop in-tick sleep). Test with one client before mass schedule.
5. P1-1, P1-3, P1-4 - query cleanups; do together, single deploy.
6. P1-2 - add/verify `(status, scheduled_at)` partial index on `campaign_recipients`.
7. P1-5 - tighten realtime SELECT policy on `messages`.
8. P1-6, P1-7 - parallelism + immediate-send guard.
9. P2 items as time permits, post-launch.

## 5. Final recommendation

**Not yet safe to schedule all 12 clients today.**

P0-1 alone caps the system at ~50 sends/min, so the moment you schedule everyone, the queue silently slips and `scheduled_at` jitter no longer reflects actual send time. P0-3 will turn every booked meeting into duplicate Slack pings, which damages trust on day one. P0-4 is a low-probability but high-blast-radius double-send risk.

Recommended path: ship P0-1, P0-3, P0-4 today (each is small), pilot full scheduling on **1-2 workspaces** for one full day, then roll out the remaining 10 once P0-2 and P1-1/3/4 are in. P1-5 should land before any client-side users (not just operators) start logging in concurrently.
