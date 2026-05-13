## Why numbers disagree (root cause)

The product has **3 different metric pipelines** computing overlapping numbers, and they disagree because they pick different sources:

| View | "Sent today" source | "Delivered today" source | "Sending now" source |
|---|---|---|---|
| Portfolio cards (`fetchPortfolioSnapshot`) | `campaigns.sent_count` summed across siblings of the active group, **including `cancelled` siblings** | `whatsapp_message_events.event_type='delivered'` grouped by `workspace_id` (denormalized column on the event) | `status='running'` AND `sent < total` — never re-checked after window closes |
| Workspace overview (`fetchWorkspaceOverview`) | not shown | `messages.direction='outbound' AND status IN (sent,delivered,read)` created today | not computed |
| Campaign cards (`groupCampaigns`) | sums `today_recipients_count` across siblings, again **including cancelled** | not shown | derived per row from `campaigns.status` |
| Partner cards | nothing today/all-time, just `bm_partner_assignments` rates | — | — |
| BM detail | `current_day_sent` (a counter on `business_managers` that nothing keeps in sync) | — | — |

Concrete symptoms reproduced in the DB:

- `eef50c7d` (cancelled GoSwyft sibling) still sums into the active group's `total=2,000`, `today=2,000` — Cards-Sticks/GoSwyft "sent 5" / "2,000 total" is this bug.
- Salesforge campaign row is `status='running'` with `sent_count=580/600` but `last_day_completed_date` is yesterday → "sending now 66%" is computed from a stale status flag, not from "did anything go out in the last N minutes".
- `delivered_today=177` vs reality ~920: `whatsapp_message_events.workspace_id` is NULL on a large fraction of webhook rows (denormalization didn't fire on retro-imported events), so they get dropped by the `if (!ev.workspace_id) return` filter.
- BM `current_day_sent` is a hand-maintained integer with no trigger keeping it in sync — always wrong.

Conclusion: the only sustainable fix is **one metrics module** that every card reads from, sourced from the **events tables**, not from the cached counters.

## Implementation order

1. Build the unified metrics layer (DB views/functions + `src/lib/metrics.ts`). Do not touch UI yet.
2. Migrate every card to it.
3. Add Partner totals.
4. Add BM fields + BM aggregates.

---

### Step 1 — Source-of-truth metrics module

**A. New SQL view `v_metrics_today`** (Dubai-day boundary, refreshed live, no materialization). Columns: `workspace_id`, `whatsapp_number_id`, `campaign_id`, `sent_today`, `delivered_today`, `failed_today`, `replies_today`. Sources:

- `sent_today / failed_today` → `campaign_recipients` where `sent_at >= dubai_start_of_day()` (truth — written when `send-whatsapp` finishes).
- `delivered_today` → `whatsapp_message_events` where `event_type='delivered'` AND `received_at >= dubai_start_of_day()`. **Backfill `workspace_id`/`whatsapp_number_id`** on the event row via a one-time UPDATE joined through `campaign_recipients.provider_message_id`, then add a trigger so future rows are denormalized at insert.
- `replies_today` → `messages.direction='inbound'` joined through `conversations.workspace_id`.

**B. New SQL view `v_metrics_alltime`** with the same shape minus the date filter for the all-time totals.

**C. New SQL function `campaign_live_status(campaign_id)`** returning one of `running | sending_now | completed_today | completed_earlier | scheduled | paused | cancelled | draft`:
- `sending_now` = `status='running'` AND a `campaign_recipients` row was sent in the last 10 min.
- `completed_today` = no pending recipients AND last `sent_at` is today (Dubai).
- `completed_earlier` = no pending recipients AND last `sent_at` is before today.
- `scheduled` = `status='scheduled'` AND `scheduled_start_at > now()`.
- The rest map 1:1 from `status`. This replaces the brittle `is_sending_now = sent<total` check.

**D. New `src/lib/metrics.ts`** — single export surface:

```ts
fetchWorkspaceMetrics(ids?: string[])      // -> Map<wsId, {sent_today, delivered_today, failed_today, replies_today, sent_alltime, delivered_alltime}>
fetchCampaignMetrics(campaignIds: string[]) // -> Map<id, {…, live_status}>
fetchNumberMetrics(numberIds: string[])
fetchPartnerMetrics(partnerIds: string[])   // aggregates over numbers owned by partner via number_ownership
fetchBmMetrics(bmIds: string[])             // aggregates over numbers linked via business_manager_id
```

All cards must call only these. `portfolioMetrics.ts` and `fetchWorkspaceOverview` are rewritten to delegate. `BusinessManagerDetail.current_day_sent` is removed from the read path (kept in DB for back-compat but no longer surfaced).

**E. Cancelled-sibling fix** (already proposed last turn) is folded into `groupCampaigns` AND into the metrics views — `WHERE status NOT IN ('cancelled','failed')` everywhere a sibling group is summed, with the "all cancelled → still show history" fallback.

### Step 2 — Card state migration

Every card switches to `live_status` from `campaign_live_status()` instead of guessing from `status` + counters. Visible card states:

```text
Sending now      — sending_now
Completed today  — completed_today
Already ran      — completed_earlier (today's launch already done)
Scheduled <when> — scheduled
Paused           — paused
No active        — none of the above
Blocked          — workspace has 0 active numbers
```

Cards updated: `WorkspaceCard`, `CampaignCard` (in `WorkspaceCampaigns`), `PartnerDetail` BM rows, `Partners` list, BM detail header, CEO Dashboard tile.

### Step 3 — Partner card totals

`fetchPartnerMetrics` sums today / all-time across numbers currently owned by the partner (via `number_ownership` active interval). Surfaced in:

- `Partners.tsx` list: two new columns `Sent today` / `Sent all-time`.
- `PartnerDetail.tsx` top summary (see Step 4).

### Step 4 — Partner page top summary + BM additions

**Partner page top strip** (single SQL, all from views above):
- Total BMs (by `bm_partner_assignments` active today, role=`provider`).
- Active / warming / disabled counts (from `business_managers.status`).
- Sent today / Sent all-time (from `fetchPartnerMetrics`).
- Open payout due / Paid (from existing `payout_runs` aggregate, no schema change).

**BM table additions** (migration adds 2 columns to `business_managers`, the rest is derived):

```sql
ALTER TABLE business_managers
  ADD COLUMN ads_launched_before  boolean NOT NULL DEFAULT false,
  ADD COLUMN next_warmup_run_date date;
```

- `ads_launched_before`: editable boolean on BM detail; auto-flipped to `true` the first time `fetchBmMetrics(bm).sent_alltime > 0` is observed (background trigger from `campaign_recipients` insert).
- `next_warmup_run_date`: editable date input on BM detail.
- Linked numbers summary + aggregate volume: derived live, not stored. New section on `BusinessManagerDetail` showing per-linked-number `sent_today / delivered_today / status` plus a totals row, all from `fetchBmMetrics`.

The BM list (`BusinessManagers.tsx`) gets two new columns: `Ads before?` and `Next warm-up`, plus `Sent today (BM total)`.

### Step 5 — Verification

- `psql` script that compares the 3 old pipelines vs the new view for the same Dubai-day window and reports max drift per workspace/campaign. Must be 0 before we ship.
- Reconciliation page (already exists) gets one extra row per workspace showing "card-shown sent_today" vs "events-truth sent_today" so any future drift is immediately visible.

---

## Out of scope / explicitly NOT done

- No new analytics surfaces beyond what's listed above.
- No change to how `send-whatsapp` writes to `campaign_recipients` — it's already the truth source; we just stop trusting `campaigns.sent_count` for read paths.
- No change to webhook ingestion logic — only adds a backfill + trigger to denormalize `workspace_id` on `whatsapp_message_events` so the existing query stops dropping events silently.

## Files touched

- New: `src/lib/metrics.ts`
- Migrations: `v_metrics_today`, `v_metrics_alltime`, `campaign_live_status()`, denorm trigger + backfill on `whatsapp_message_events`, BM columns.
- Rewrite: `src/lib/portfolioMetrics.ts` (delegates to metrics.ts), `src/lib/campaigns.ts` (`groupCampaigns` cancelled-sibling fix).
- Update consumers: `WorkspaceCampaigns.tsx`, `WorkspaceOverview.tsx`, CEO Dashboard tile, `pages/admin/Partners.tsx`, `PartnerDetail.tsx`, `BusinessManagers.tsx`, `BusinessManagerDetail.tsx`, `Reconciliation.tsx`.

## Definition of done

- Same number for `sent_today` on a given workspace appears identically on: portfolio card, workspace overview, the campaign card on `WorkspaceCampaigns`, partner card (via aggregation), BM card (via aggregation).
- Salesforge no longer shows "sending now" the day after it finished.
- Cards-Sticks shows the correct ~400 sent today, not 5; not 2,000 total.
- Partner cards show today + all-time totals.
- BM rows show ads-before flag + next warm-up + aggregate sent.
- Reconciliation page shows 0% drift between cards and events.
