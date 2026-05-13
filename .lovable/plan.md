## Locked product rule (non-negotiable)

**Capacity-bound allocation.** A campaign may only materialize as many `campaign_recipients` rows as its real sending capacity:

```
capacity = Σ(daily_send_limit of selected numbers) × number of selected sending days
```

| Numbers | Cap/number | Days | Allocatable |
|---|---|---|---|
| 1 | 200 | 1 | 200 |
| 2 | 200 | 1 | 400 |
| 2 | 200 | 2 | 800 |
| 3 | 200 | 5 | 3000 |

Rules:
1. If the selected audience > capacity, only the first `capacity` recipients are inserted into `campaign_recipients`. The rest stay in audience as `unused`/free.
2. Overflow is **not** reserved, **not** marked used, **not** moved to a "later" bucket. It remains fully available for any other campaign.
3. No silent "we'll send tomorrow anyway" behavior. Spillover into future days only happens if the operator explicitly added those days at launch.
4. Worker still enforces the per-number daily cap as a hard safety net, but the primary defense is at materialization time.

---

## Task A — Hard capacity-bound allocation (priority 1)

### A1. Schema

Migration:
- `whatsapp_numbers.daily_send_limit int not null default 200` (backfill 200 for all rows; admin can edit per number later).
- `campaigns.per_number_daily_cap int` — snapshot at launch.
- `campaigns.allocated_capacity int` — snapshot at launch (`numbers × cap × days`).
- `campaigns.audience_total int` — what operator originally selected (for "X of Y allocated" UX).
- `campaign_recipients`: add partial unique index `(campaign_id, whatsapp_number_id, scheduled_day)` via a generated column `scheduled_day = (scheduled_at AT TIME ZONE 'Asia/Dubai')::date` to make per-number-per-day overload structurally impossible.

### A2. Materialization (in `LaunchWizard` → `campaigns` edge function `launch` action)

New deterministic algorithm replacing current insert path:

```
days     = scheduled_dates.length (>=1)
numbers  = selectedNumbers (>=1)
caps     = numbers.map(n => n.daily_send_limit)        // e.g. [200,200,200]
capacity = sum(caps) * days
take     = audience.slice(0, capacity)                 // hard truncate
slots    = []
for each day in days:
  for each number in numbers:
    slots.push({ day, number, free: number.daily_send_limit })

// round-robin fill, never exceeding any slot's `free`
for r in take:
  pick next slot with free > 0 (round-robin across numbers, then days)
  insert campaign_recipient { number, scheduled_at: window-spread-within(day) }
  slot.free--
```

Spreading within a day uses `delay_min_seconds`/`delay_max_seconds` between consecutive sends **on the same number** inside `[schedule_window_start, schedule_window_end]`. If the window can't physically fit `daily_send_limit` at the configured pacing, we surface an error in the wizard ("window too narrow for cap") instead of silently re-spacing.

### A3. Wizard UX

In `LaunchWizard.tsx` audience step:
- Show live: `Capacity: 400  ·  Selected: 930  ·  Will allocate: 400  ·  Leftover stays in audience: 530`.
- "Launch" button stays enabled (capacity ≤ audience is fine), but a confirm modal appears when truncation > 0: *"Only 400 of 930 will be sent. The remaining 530 stay in the audience pool, untouched. Continue?"*
- Toggle "Add another sending day" / "Add another number" recomputes capacity instantly.
- If audience < capacity, show `Capacity: 400 · Selected: 120 · Slack: 280` (no truncation).

### A4. Audience overflow handling

- `mark_audience_rows_used` is called only for the `take` slice, not the full selection. The other rows remain `usage_status='unused'`.
- No `reserved` state for overflow. No background job moves overflow into the campaign later.

### A5. Worker safety net (`supabase/functions/campaigns/index.ts`)

Before each send:
- `sent_today = count(*) from campaign_recipients where whatsapp_number_id = X and (sent_at AT TIME ZONE 'Asia/Dubai')::date = today and status in ('sent','delivered','read','failed')`
- if `sent_today >= number.daily_send_limit` → push the recipient's `scheduled_at` to next configured day at `schedule_window_start`, log `cap_reached`, do NOT send.
- This guards against bulk SQL retries, manual reschedules, and any future bug that bypasses the wizard.

### A6. Retry-failed action

Already planned (`retry_failed`) — must respect the same cap. Retries that exceed `daily_send_limit` for today get pushed to the next operator-selected day, never into a brand-new day the operator didn't pick.

---

## Task B — Restriction / blocked alerts (priority 2)

Audit and fix:
- `enqueue_number_slack_event` trigger fires on `status` transitions (`active → restricted/blocked`) and on `messaging_limit` changes. Verify it's actually attached to `whatsapp_numbers` and that `slack-dispatch` is consuming events for `number_restricted`, `number_blocked`, `number_quality_changed`.
- `numbers-health-sync` edge function: confirm it's writing `restricted_at`, `messaging_limit`, `status` from Meta/Gupshup signal, not silently no-oping when the API returns "ok".
- `numbers-health-digest` cron: confirm it's posting the daily roll-up.
- Add a missing case: when a campaign hits ≥10 failures with provider error indicating restriction (`#131048`, `#131056`, `#368`, etc.) on the same number within 5 minutes, force-flip `whatsapp_numbers.status = 'restricted'` and emit the alert from the worker, not waiting for next health-sync tick.

Files to touch: `supabase/functions/numbers-health-sync/index.ts`, `supabase/functions/numbers-health-digest/index.ts`, `supabase/functions/campaigns/index.ts`, `supabase/functions/slack-dispatch/index.ts`.

---

## Task C — Live metrics + stale Insights (priority 3)

- Replace stat cards (TOTAL/SENT/FAILED/REPLIED/POSITIVE/MEETING) with live read from `campaign_report_rows` on every panel mount + 30s poll. No reading from `campaign_insights.metrics` for numbers.
- `campaign_insights` keeps only the AI Markdown narrative + a `generated_at` banner ("Snapshot from 13 May 11:42 GST · Regenerate").
- `auto-generate-insights`: trigger regeneration when `(replied since last_snapshot) >= 10` OR `(classified since last_snapshot) >= 10`, throttled to once per 30 min per campaign.
- `WorkspaceCampaigns.tsx` table: add `Replied` and `Reply rate` columns sourced from a new RPC `campaign_live_counts(uuid[]) -> (campaign_id, sent, failed, pending, replied, positive, meeting)`. Extend `CampaignRow` / `groupCampaigns` in `src/lib/campaigns.ts`.

---

## Files touched (summary)

```
migrations:
  + whatsapp_numbers.daily_send_limit
  + campaigns.{per_number_daily_cap, allocated_capacity, audience_total}
  + campaign_recipients.scheduled_day generated col + index
  + RPC campaign_live_counts(uuid[])

supabase/functions/campaigns/index.ts        (new materialization, cap guard, retry_failed)
supabase/functions/numbers-health-sync/index.ts
supabase/functions/numbers-health-digest/index.ts
supabase/functions/slack-dispatch/index.ts
supabase/functions/campaign-insights/index.ts (narrative-only)
supabase/functions/auto-generate-insights/index.ts (new trigger criteria)

src/pages/workspace/LaunchWizard.tsx         (capacity widget, confirm modal, days/numbers picker)
src/lib/launchData.ts                        (capacity helpers, round-robin slot filler)
src/lib/campaigns.ts                         (replied/positive in CampaignRow)
src/pages/workspace/WorkspaceCampaigns.tsx   (Replied + Reply rate columns)
src/components/workspace/CampaignReportPanel.tsx (live metrics, snapshot banner)
src/components/workspace/LatestReportCard.tsx
```

---

## Post-Task-A self-report I will deliver

After Task A ships I will explicitly verify and report back on:

1. **Audience > capacity.** Run a synthetic launch with `audience=930`, `numbers=1×200`, `days=1`. Report row count in `campaign_recipients` (must be 200) and row count in `audience_rows` with `usage_status='unused'` for the leftover (must be 730).
2. **Overflow location.** Confirm the 730 leftover are still `usage_status='unused'`, not `reserved`, not `used`, not tagged with the new `campaign_id`.
3. **Silent over-allocation impossible.** Two checks:
   - DB-level: the partial unique index on `(campaign_id, whatsapp_number_id, scheduled_day)` plus a sum check trigger blocks any insert that would push that day's count over `daily_send_limit`.
   - App-level: launch flow truncates before insert, wizard surfaces the truncation, worker re-checks per send.

If any of those three fail in verification, Task A is not done — I'll fix and re-verify before moving to Task B.

---

## Implementation order

1. Migration (A1) → 2. Materialization rewrite (A2, A4) → 3. Wizard capacity UI (A3) → 4. Worker cap guard (A5) → 5. Retry-failed respects cap (A6) → 6. **Self-report** → 7. Task B → 8. Task C.