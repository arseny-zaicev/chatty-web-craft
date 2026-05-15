## Goal

Promote today's implicit "marketing blast" (delays = 0) to a first-class, explicit `marketing_instant` dispatch mode with a snapshot-based prep step, real backpressure, pool-participation safety, mixed-timezone clarity, a kill switch, and operator-visible runtime + failure state. All existing safety rails remain.

---

## Files changed

**DB (migration)**
- `campaigns`: add
  - `dispatch_mode text not null default 'paced'` (`'paced' | 'marketing_instant'`)
  - `prepared_at timestamptz`, `prepared_expires_at timestamptz`, `prepared_report jsonb`, `prepared_signature text` (hash of selected numbers + template id + audience size + window + caps)
  - `kill_switch_at timestamptz`, `kill_switch_by uuid`, `kill_switch_reason text`
  - `max_inflight_per_number int not null default 5`
  - `max_inflight_per_campaign int not null default 50`
- `whatsapp_numbers`: add `paused_at timestamptz`, `paused_reason text` (per-sender kill switch).
- New table `campaign_dispatch_events` — append-only `(campaign_id, whatsapp_number_id, event_type, reason, payload, created_at)`. Workspace members read.
- New table `provider_backoff` — `(whatsapp_number_id pk, retry_after timestamptz, last_status int, last_error text, updated_at)` for 429/5xx backoff state.
- New global flag `system_flags(key, value)` row `marketing_instant_enabled` for global kill switch on the mode itself.

**Edge functions**
- `supabase/functions/campaigns/index.ts`
  - `createCampaign` accepts `dispatch_mode`, `max_inflight_per_number`, `max_inflight_per_campaign`.
  - **New action `prepare`**: builds a snapshot and writes it to `campaigns.prepared_report`:
    - Selected sender numbers (id, phone, status, webhook_connected, provider keys present, current backoff).
    - Template + variables (re-runs `validateTemplateForLaunch`).
    - Audience size, allocation per number (uses existing allocator), and any number with **zero allocation** flagged.
    - Effective caps per number (min of `daily_send_limit`, `per_number_quota`, window-fit).
    - Effective rate ceiling per number and per campaign (from new inflight caps).
    - Window per recipient TZ.
    - Sets `prepared_at = now()`, `prepared_expires_at = now() + 15 min`, `prepared_signature = sha256(...)`.
    - Returns `{ ok, blockers, warnings, snapshot }`.
  - **`launch`** requires:
    - `prepared_at` present, `now() < prepared_expires_at`,
    - current `prepared_signature` matches a freshly recomputed one (sender pool / template / audience unchanged) — otherwise `409 stale_snapshot, must_reprepare: true`.
    - `kill_switch_at IS NULL` and global `marketing_instant_enabled=true` (for instant mode).
  - When `dispatch_mode = 'marketing_instant'`:
    - All recipients get `scheduled_at = max(now(), windowStart_in_recipient_tz)` — **per recipient TZ**, not a single global second.
    - Tick-loop pacing floor for marketing changes from `1s` to `0s`.
    - Drop the per-tick `setTimeout(waitMs)` for already-due rows.
  - **Backpressure (both modes, primary throttle in instant mode)**:
    - In-memory + Redis-style per-number and per-campaign inflight counters (using `campaign_dispatch_events` + `provider_backoff` for cross-tick state). A tick will not start a send if `inflight_for_number >= max_inflight_per_number` or `inflight_for_campaign >= max_inflight_per_campaign`.
    - On Gupshup `429` or `5xx`, write `provider_backoff(retry_after = now + expBackoff)` and stop dispatching to that number until then. Honor `Retry-After` if present. Log to `campaign_dispatch_events`.
  - **Kill switch enforcement**:
    - At every tick: if `campaigns.kill_switch_at` is set, mark all pending recipients `paused`, log event, exit.
    - If `whatsapp_numbers.paused_at` is set, skip that number, log `idle: sender_paused`.
    - If global `marketing_instant_enabled=false`, instant campaigns are paused on the next tick with reason `instant_mode_disabled`.
  - On every skip/idle/error path, append a row to `campaign_dispatch_events` with the exact reason (window_closed, cap_reached, restricted, webhook_missing, provider_429, provider_5xx, sender_paused, killed, snapshot_stale, no_allocation).
- New action `kill_switch`: body `{ scope: "campaign"|"sender"|"instant_mode_global", id?, reason }`. Admin / workspace manager only.

**Frontend**
- `src/pages/workspace/LaunchWizard.tsx`
  - Explicit "Dispatch mode" selector: `Marketing Instant` vs `Paced`. No more inferring blast from delays = 0.
  - Inputs for `max_inflight_per_number` and `max_inflight_per_campaign` (defaults 5 / 50, with sensible min/max).
  - **Pre-launch checklist** rendered from `prepare` response:
    - Hard blockers (must fix): missing webhook, template invalid, zero-allocation number, no eligible numbers, snapshot expired, kill switch on.
    - Warnings (acknowledge): low capacity vs audience, large TZ spread, numbers in backoff, etc.
    - Mixed-TZ note: "Instant means each recipient is sent immediately when their **local** window opens. Recipients in different timezones will not all send at the same global second."
    - Snapshot freshness badge with countdown to `prepared_expires_at` and a "Re-prepare" button.
  - Launch button disabled until snapshot is fresh, signature matches, and zero blockers.
- `src/components/workspace/CampaignReportPanel.tsx` (or new `CampaignRuntimePanel.tsx`) shown on `/ws/:slug/campaigns`:
  - Dispatch mode badge, snapshot freshness, kill switch state.
  - Selected vs allocated audience; per-number allocation, sent, failed, inflight, backoff-until.
  - Current rate (msgs/min last 60s) per number and per campaign.
  - **Active senders** = numbers with a send in last 60s. **Idle senders** with the exact reason from `campaign_dispatch_events`.
  - **Pool participation alert**: if campaign is `running`, window is open, and < 50% of selected numbers have sent in last 5 min, raise a red banner listing each idle number + reason.
  - Buttons: pause campaign, pause individual sender, global "disable instant mode" (admin only).
- `src/lib/campaigns.ts` — add `prepareCampaign()`, `getRuntimeStatus()`, `killSwitch()` helpers.

---

## Pre-launch snapshot contract

`prepared_report` JSON shape:
```
{
  signature: "sha256:...",
  expires_at: "...",
  numbers: [{ id, phone, status, webhook_connected, allocation, daily_cap, effective_rate_per_min, backoff_until }],
  template: { id, name, valid: true, warnings: [] },
  audience: { total, by_tz: { "Asia/Dubai": 120, ... } },
  caps: { per_number_inflight, per_campaign_inflight, per_number_daily },
  window: { start: "09:00", end: "18:00", per_recipient_tz: true },
  blockers: [...], warnings: [...]
}
```
Re-prepare is required (launch returns `409 stale_snapshot`) when:
- `now() >= prepared_expires_at` (default TTL 15 min), or
- recomputed `prepared_signature` differs (numbers added/removed, template changed, audience changed, caps/window changed).

---

## Exact dispatch behavior added (marketing_instant)

1. Operator explicitly chooses the mode in the wizard.
2. After `prepare` succeeds, `launch` schedules every recipient at `max(now, windowStart_in_recipient_tz)` — **immediate within each recipient's local allowed window**, not a single global second.
3. Tick loop sends in parallel up to `max_inflight_per_number` per number and `max_inflight_per_campaign` overall, with no `setTimeout`-based gap on the same number.
4. Gupshup `429`/`5xx` → exponential backoff per number via `provider_backoff`, honoring `Retry-After`. Backoff is the brake; removing `setTimeout` alone is not the throttle.
5. Kill switch (campaign / sender / global instant) halts dispatch on the next tick.

---

## Artificial delays removed (only in marketing_instant)

- 1 msg/sec/number floor (`floor = isUtility ? 60 : 1` at index.ts:1299) → `0` for instant.
- 1-second `scheduled_at` stagger (`blastStart + i * 1000` at index.ts:621) → all rows scheduled at `blastStart` of their TZ window.
- Per-tick `setTimeout(waitMs)` wait for "future" rows in instant mode.
- Any ±20% jitter — confirmed already off for blast; locked off for instant.

`paced` mode unchanged.

---

## Safety rules that remain in place

- Local launch window per recipient TZ — enforced at scheduling and at tick time.
- Sender pool enforcement — only `numberIds` from the snapshot are eligible.
- Allocation correctness — `campaign_number_allocations` honored.
- Per-number daily cap — `daily_send_limit` + `per_number_quota` + the existing "bump to tomorrow 09:00 Dubai" safety net.
- Auto-restriction on burst error codes (`RESTRICTION_CODES`).
- Canary abort.
- Template + variable validation (`validateTemplateForLaunch`) — runs in `prepare`, blocks launch.
- Webhook readiness check — prep blocker if any selected number has `webhook_connected = false` (fixes the silent 200-message burn from the Nitish incident).
- Job locks (`acquireJobLock`) on cron-driven dispatcher.
- New: backpressure caps, provider backoff, kill switches, snapshot signature/TTL.

---

## What operators can now control / see

Control:
- Explicit `Dispatch mode` selector.
- `max_inflight_per_number`, `max_inflight_per_campaign`.
- Snapshot Re-prepare.
- Kill switches: campaign, individual sender, global instant mode.

See:
- Snapshot freshness, blockers, warnings before launch — including any selected number that received **zero allocation**.
- Mixed-TZ explanation in wizard summary.
- Live runtime panel: per-number allocation / sent / failed / inflight / backoff-until, current rate, active vs idle senders with exact reason.
- Pool participation alert when window is open but selected senders are idle.

---

## Verification (test cases)

Edge-function Deno tests (`supabase/functions/campaigns/*_test.ts`) plus a small UI smoke list:

1. **Instant mode happy path** — prepare → launch → all rows scheduled at `max(now, window_start_tz)`, no 1s stagger, sends drain within seconds for a 50-msg, 5-number pool.
2. **Paced mode unchanged** — same input with `dispatch_mode='paced'` produces staggered `scheduled_at` and ≥1s/number gap (regression guard).
3. **Window enforcement** — instant launch outside window → recipients scheduled at next window open, not now; tick before window logs `idle: window_closed`.
4. **Mixed TZ** — recipients in `Asia/Dubai` and `America/New_York` get different `scheduled_at`s aligned to each local window.
5. **Snapshot staleness** — launch after `prepared_expires_at` returns `409 stale_snapshot`.
6. **Snapshot signature change** — toggle a sender between prepare and launch → `409 stale_snapshot`.
7. **Zero-allocation number** — sender with `daily_send_limit=0` is flagged in `prepare.blockers` and surfaced in UI before launch.
8. **Pool participation** — simulate one of three numbers idle for 6 min while window is open → runtime status returns alert + idle-reason rows.
9. **Per-number cap enforcement** — number with `daily_send_limit=10` stops at 10, remaining recipients bumped to tomorrow 09:00 Dubai (existing rule still passes under instant mode).
10. **Inflight caps** — `max_inflight_per_number=2` keeps concurrent in-flight ≤ 2 for that number even in instant mode.
11. **Provider 429** — mocked Gupshup returns 429 with `Retry-After: 30` → `provider_backoff.retry_after` set to now+30s, no further sends to that number until then.
12. **Provider 5xx** — exponential backoff applied; recovers and resumes after success.
13. **Kill switch — campaign** → next tick marks pending as `paused`, logs `killed`.
14. **Kill switch — sender** → that sender skipped, others continue.
15. **Kill switch — global instant** → all running instant campaigns paused; paced campaigns unaffected.
16. **Webhook missing blocker** → number with `webhook_connected=false` blocks `prepare`.

Each test covers the new behavior end-to-end against a local supabase-js client (already used in existing edge-function tests).
