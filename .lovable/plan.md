## Problem

Two issues with the Launch wizard "Today fits" hint and the multi-day flow:

1. **Wrong per-day math.** The hint computes "1 msg every 28s" and "Today fits ≈ 2,194 of 2,808" against the **full** recipient count, ignoring two real constraints:
   - The launcher already splits recipients evenly across selected days (`perDay = ceil(total / N days)` in backend `launchCampaign`).
   - There's a hard cap: `perNumberQuota` (default 200) per number per day. With 2 numbers that's 400/day max, so 2808 over 5 days (562/day) is **impossible** - the cap forces 400/day and the campaign actually needs ≥ 8 days.
   The hint should make this obvious instead of pretending all 2808 should fit in today's 11h window.

2. **No heads-up between days.** When today's batch finishes, the team has no Slack signal telling them when tomorrow's batch starts and how big it is.

## Plan

### 1. Honest per-day math in `src/pages/workspace/LaunchWizard.tsx`

Recompute in `pacing` + `feasibility` memos (lines 399-431) using:

- `numbers = activeNumbers.length`
- `daysSelected = scheduledDates.length` (Pick-days mode)
- `dailyCap = numbers * perNumberQuota` (e.g. 2 × 200 = 400/day)
- `idealPerDay = ceil(recipients.length / max(1, daysSelected))` (e.g. 562)
- `effectivePerDay = min(idealPerDay, dailyCap)` (e.g. 400)
- `daysNeeded = ceil(recipients.length / dailyCap)` (e.g. 8)
- `pacing.perNumber` (for the gap calc) becomes `ceil(effectivePerDay / numbers)` (e.g. 200), so "1 msg every X" reflects today's real load (200 msgs / 11h ≈ 1 every ~3.3 min).
- `feasibility.totalQueued` becomes `effectivePerDay` (today's share), `fitsToday` / `overflow` recomputed against that.

Banner rules (Pick-days mode):
- **Cap not exceeded** (idealPerDay ≤ dailyCap): "Today's share: ~X of Y total (split across N days, ~X/day). Fits before <windowEnd> in recipient TZ."
- **Cap exceeded** (idealPerDay > dailyCap): amber warning - "⚠ Selected N day(s) can't hold Y messages at <quota>/number/day on <numbers> number(s) (max <dailyCap>/day = <N×dailyCap> total). You need at least <daysNeeded> days, or raise quota / add numbers. Today will send <dailyCap>; the rest auto-rolls forward day by day."
- **Today not in selected dates**: "Nothing scheduled for today. First batch (<effectivePerDay> msgs) starts <firstDate> at <windowStart> recipient TZ."
- **Today in selected dates but past windowEnd**: "Today's window already closed. Today's <effectivePerDay> will roll into <nextDate>."

Also update Review pane (right side):
- `Per number` → show `ceil(effectivePerDay / numbers)` (today's per-number load, not lifetime).
- New row `Per day` → `effectivePerDay`.
- New row `Days needed` → `daysNeeded` (highlighted amber if > daysSelected).
- `ETA` → recompute as `daysNeeded × windowHours` (currently shows 35h6m for the impossible 5-day plan).

### 2. End-of-day Slack notification

Add `campaign_day_completed` event fired when:
- Campaign is multi-day (`scheduled_dates` length > 1 OR overflow into a new day occurred).
- All `campaign_recipients` for today (scheduled_at::date = today) are terminal (`sent`/`failed`/`skipped`).
- The campaign still has future scheduled rows.

Implementation:

a. **Migration:** add `campaigns.last_day_completed_date date` (nullable) to dedupe.

b. **Edge function** `campaign-day-rollover` (new):
   - Loop running campaigns with multi-day plans.
   - For each, compute today's `sent / failed / total` and tomorrow's `next batch size` + `start time` (windowStart in recipient TZ, based on pool country).
   - When today's pending = 0 and `last_day_completed_date != today`, insert into `slack_event_queue` with payload `{ campaign_id, name, day, sent_today, failed_today, next_day, next_day_start_local, next_day_recipients }` and stamp `last_day_completed_date`.

c. **Cron:** schedule via `supabase--insert` (pg_cron + pg_net) every 15 min.

d. **Slack formatter** `supabase/functions/_shared/slackBlocks.ts`:
   - Add `campaign_day_completed` block: "✅ Day finished - <name>: <sent_today> sent, <failed_today> failed today. 📅 Next batch (<next_day_recipients> msgs) starts <next_day> at <next_day_start_local> recipient TZ."

This rides the existing `slack_event_queue` → `slack-dispatch` pipeline, so it auto-posts to the workspace Slack channel if connected and silently skips if not. No per-campaign opt-in needed.

## Technical notes

- Backend `launchCampaign` already does even split per day, but does **not** enforce `per_number_quota` against scheduled_dates today - that limit only kicks in on the worker via `delayMin/Max`. So the frontend warning is the only place a user can see "your day count is too low". Worth a follow-up to also auto-extend `scheduled_dates` server-side, but that's separate.
- Recipient-TZ next-day start: pool country → primary TZ map already exists (`COUNTRY_TZ` in LaunchWizard). Reuse the same logic in the edge function (small lookup table).
- `campaign_day_completed` will not fire if `daysSelected = 1` and there's no overflow (campaign just finishes → existing `campaign_completed` covers it).
