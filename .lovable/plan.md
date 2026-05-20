
# Statistics & Payout Truth - Audit + Fix Plan

## 1. Executive summary

Numbers are not trustworthy today because four different counting paths exist for the same concepts, plus the partner attribution tables are mostly empty.

The same "delivered today" KPI shown on dashboards is computed by a SQL view that **silently loses ~10% of events** (events that never got `campaign_recipient_id` filled), while the payout engine counts events through a completely different join (`whatsapp_numbers.business_manager_id` + `bm_partner_assignments` for provider, or `number_ownership` for referral). **`number_ownership` currently has 0 rows**, so the referral path and the legacy no-role payout function are mathematically guaranteed to return $0 for every partner. Provider role works for the 6 BM assignments that exist, but **15 of 41 WhatsApp numbers have no `business_manager_id`** and are therefore invisible to provider payouts.

Worse, on the recipient side the enum (`pending|scheduled|sending|sent|failed|replied`) has no `delivered`/`read`, so `delivered` only exists as event rows in `whatsapp_message_events`. Three different functions then re-derive it differently. The webhook also only promotes a recipient from `pending/scheduled/sending` → `sent`, never updating "already-sent → delivered/read", so the recipient row is permanently lossy for delivery state.

Before any partner-payout UI is built, we have to (a) normalize a single canonical event log, (b) backfill missing links, (c) define one set of metric SQL functions, (d) repoint every dashboard at them, and only then (e) layer payout reports on the same numbers.

---

## 2. Current source-of-truth map

Per-metric, with file/function references.

| Metric | Source today | Type | Status |
|---|---|---|---|
| `queued` | `messages.status='queued'` (outbound, pre-webhook) | raw | Inconsistent. No recipient equivalent. Inbox-only. |
| `sent` (per campaign) | `campaign_recipients.status IN ('sent','replied')` aggregated by `campaign_live_counts(p_campaign_ids)` (function filter wrongly also lists `delivered/read` which don't exist in the enum) | aggregated | Correct in practice (dead branches), but the function code is misleading. |
| `sent_today` (workspace) | `v_metrics_today.sent_today` = `count cr where sent_at>=today and status<>'failed'` | aggregated | OK while every send updates `sent_at`. Stops at recipients - manual inbox sends excluded. |
| `sent_alltime` | `v_metrics_alltime` (same shape, no date) | aggregated | Same caveat. |
| `failed` | `campaign_recipients.status='failed'` (set by webhook or by `campaigns/index.ts` on send error) | raw | Correct. Excludes provider-rejected templates whose webhook lacks `provider_message_id`. |
| `error` | not a separate metric anywhere; folded into `failed` on the recipient and into `whatsapp_message_events.event_type='failed'` with `error_code/error_message`. | raw | Acceptable, but UI never surfaces error breakdown by code. |
| `delivered` (per campaign) | `campaign_live_counts.delivered_count` = `count distinct cr.id where event_type='delivered'` joined via `campaign_recipient_id` | aggregated | **Lossy.** Misses events with NULL `campaign_recipient_id` (~32%). |
| `delivered_today` (workspace) | `v_metrics_today.delivered_today` = `count distinct cr.id where event_type IN (delivered, read) and received_at>=today` joined via `campaign_recipient_id` | aggregated | Same loss. |
| `delivered` (per number) | `v_metrics_today_by_number`, `v_metrics_alltime` (same join) | aggregated | Same loss. |
| `read` | events `event_type='read'` only; collapsed into "delivered" in the views; messages.status='read' on inbox. | raw | Not surfaced as its own KPI anywhere. |
| `replied` (per campaign) | Two definitions used in parallel: (a) recipient `status='replied'` set by webhook on inbound; (b) `campaign_live_counts.replied` = EXISTS inbound message in conversation; (c) `campaign_report_rows.replied` = first_reply_at OR has_inbound. | derived | Three definitions can differ by edge cases (recipient never linked, conversation reassigned). |
| `replies_today` (workspace) | `v_metrics_today.replies_today` = `conversations.first_human_reply_at` >= today | derived | **Wrong concept.** This counts when *our setter first replied to the lead*, not when the lead replied to us. Misnamed. |
| `blocked` | nothing. `whatsapp_message_events.error_code` can carry block codes, but never aggregated. | missing | Missing. |
| `skipped` | nothing. Capacity overflow drops recipients before insert (`campaigns/index.ts` line ~304); `lead_imports` may have status `skipped` but it's not joined to stats. | partial | Missing as a stat. |
| `cancelled` | `campaigns.status='cancelled'`; recipients within stay in their last status. | raw | OK at campaign level, no recipient-level cancel. |
| Per workspace/client | All workspace views join by `cr.workspace_id`. Backfilled by trigger `trg_fill_event_workspace_number` for events. | aggregated | OK when triggers fired. 1,132 events have NULL workspace_id - excluded from views. |
| Per date range | Only "today" and "all-time" views exist. Range queries are ad-hoc per page. | mixed | No canonical range function. Each page rolls its own. |
| Per partner | `recompute_payout_run` (no role): `number_owner_at(...)` from `number_ownership` (table is **empty**). `recompute_payout_run_role` provider: `whatsapp_numbers.business_manager_id` → `bm_partner_assignments`. referral: same `number_owner_at` empty table. | aggregated | Provider works for 6 BMs. Referral and legacy = 0. |
| Per referral | `payout_runs.role='referral'` + `partners.referrer_partner_id` chain + empty `number_ownership` | aggregated | Always 0 today. |

UI consumers of stats (so we know what to repoint later):

- `src/lib/portfolioMetrics.ts` - `fetchPortfolioSnapshot`, `fetchWorkspaceOverview` (reads `v_metrics_today`, `v_metrics_today_by_campaign`)
- `src/pages/AdminPanel.tsx` (sumof `delivered_today`, `replies_today`)
- `src/pages/workspace/WorkspaceOverview.tsx` (KPIs)
- `src/pages/workspace/WorkspaceCampaigns.tsx` (calls `campaign_live_counts` RPC)
- `src/components/workspace/CampaignReportPanel.tsx` and `LatestReportCard.tsx` (same RPC)
- `src/components/workspace/NumbersInventory.tsx` (`v_metrics_today_by_number`)
- `src/components/workspace/CampaignRuntimePanel.tsx`, `DispatchControlPanel.tsx`, `MessageIntegrityPanel.tsx`
- `src/pages/admin/PartnerDetail.tsx`, `FleetAnalytics.tsx`, `FinancePartnerDetail.tsx`, `FinanceRunDetail.tsx`
- Edge functions: `payout-report-pdf`, `manager-payout-report-pdf`, `campaign-insights`, `campaign-report-export`, `campaign-report-pdf`, `auto-generate-insights`, `numbers-health-digest`, `ops-assistant`

---

## 3. Historical reliability assessment

What we measured against today's DB.

| Question | Answer | Evidence |
|---|---|---|
| Can we count `sent` historically? | Yes, for campaign-routed sends. Recipients table is intact (5,876 sent + 1,135 replied + 1,928 failed + 8,500 still scheduled). | `campaign_recipients` row count |
| Can we count `delivered` historically? | Partially. 7,317 delivered events exist, but only 6,612 link back to a recipient via the current view (~10% gap). 1,158 events have NULL `whatsapp_number_id` (~16% loss for payout). | counted directly |
| Can we count `read` historically? | Yes as events, but it's collapsed into delivered in current views, so the breakdown is not surfaced. | views inspected |
| Can we count `failed` historically? | Yes for events (1,957). Recipient status='failed' = 1,928. The 29-row drift is the population of events that arrived without `campaign_recipient_id`. | counted |
| Can we backfill `campaign_recipient_id` on orphan events? | Yes - join `whatsapp_message_events.provider_message_id` to `messages.provider_message_id` then `messages.metadata.campaign_recipient_id` or `messages.conversation_id → campaign_recipients.conversation_id`. Estimated coverage 80-95% based on existing webhook fallback at lines 703-706. | webhook code |
| Can we backfill `whatsapp_number_id` and `workspace_id`? | Yes - trigger `trg_fill_event_workspace_number` does it for new rows; we run it as a one-shot update for old rows that still match a `messages` row. | trigger exists |
| Can we reconstruct partner payouts for past periods? | No, **not until `number_ownership` is populated**. Currently 0 rows. We must define a starting `effective_from` per number based on creation date or a partner-supplied date. | counted |
| Are `bm_partner_assignments` retroactive? | Six assignments exist. We must check that their `effective_from` predates the events they should cover; otherwise past delivered events will price at $0. | needs spot-check during fix |
| Are `workspace_billing_rates` retroactive? | 13 rows exist; same concern - any event before the earliest `effective_from` will get `c_rate=NULL` and `billed_usd=0`. | counted |
| Replied (lead-replied) historically? | Yes, but only if conversation exists. Recipients with `status='replied'` (1,135) is reliable. "Lead first replied at" is **not stored as a column** - we'd derive from first inbound `messages.created_at`. | schema |

**Bottom line:** site-side stats can be fully backfilled with two one-shot SQL updates. Partner/referral history cannot be reconstructed until ownership tables are filled in with effective dates.

---

## 4. Partner/referral payout readiness

What currently blocks correct payouts.

| Blocker | Evidence | Impact |
|---|---|---|
| `number_ownership` table is empty | `SELECT count(*) = 0` | Every non-role and every referral payout currently computes $0 |
| `partner_rates` table is empty | `SELECT count(*) = 0` | `partner_rate_at()` returns 0; the old `recompute_payout_run` (no role) would yield $0 even if ownership existed |
| 15/41 numbers have no `business_manager_id` | counted | Those numbers are invisible to provider payouts |
| Payout event filter excludes `read` | `recompute_payout_run_role` filters `event_type IN ('delivered','failed','sent')` | If a delivery is observed only via `read` (Gupshup sometimes skips delivered), the event is counted as delivered by site KPIs (view counts `delivered OR read`) but NOT by payouts. Site and payout disagree. |
| Payout double-counts non-campaign sends | The payout pulls all events on the number; inbox manual sends and Quick Template re-engagements also go through Gupshup and emit `delivered` | Payout will pay the partner for messages a setter sent by hand. Site stats won't show these. |
| `bm_assignment_rate_at` effective dates | The function uses `received_at` of the event; if assignments were created today with `effective_from=now()`, all historical events will price at $0 | needs explicit backdating |
| `workspace_billing_rate_at` effective dates | Same concern, 13 rows, no audit | needs spot-check |
| No idempotency on payout regeneration | `recompute_payout_run_role` is allowed only on `draft`; once approved it's frozen. Source data can drift afterwards (`verify_payout_run` flags it). But there is no UI surfacing drift. | Hidden underpayment / overpayment risk |
| Referral chain only one level deep | `partners.referrer_partner_id` is a single uuid - no multi-level | OK if you only have one tier; document this constraint |
| Manager (downline) report uses raw event counts | `manager-payout-report-pdf` queries `whatsapp_message_events` directly with no role/rate snapshot | Cannot reconcile against `payout_line_items`; the two reports for the same period may not match |

---

## 5. Top concrete gaps (with refs)

1. **Event → recipient link loss** - `supabase/functions/whatsapp-webhook/index.ts:722-732`. ~32% of events have no `campaign_recipient_id`. Need backfill + add a `provider_message_id` index on `campaign_recipients` (already present per `\d`) and a stronger retry/fallback before insert.

2. **Recipient enum lacks `delivered`/`read`** - migration `\dT campaign_recipient_status`. `campaign_live_counts` references nonexistent values, hiding the intent. Either extend the enum and have the webhook promote, or drop those values from the filter and document that delivery state lives in events.

3. **`v_metrics_today.replies_today` is mislabeled** - reads `conversations.first_human_reply_at` (= setter's first reply). The UI label is "Replies today" suggesting lead replies. `src/pages/workspace/WorkspaceOverview.tsx:87`, `src/pages/AdminPanel.tsx:242`.

4. **Payout misses `read`-only deliveries** - `recompute_payout_run_role` SQL filter `IN ('delivered','failed','sent')`. Site view counts `IN ('delivered','read')`. Disagreement is structural.

5. **Payout includes non-campaign sends** - any `whatsapp_message_events` row on the number is counted. Inbox manual sends, Quick Template re-engagements, and slack-dispatch sends all qualify. There's no `is_campaign` flag on events. We need to either filter to `campaign_recipient_id IS NOT NULL` OR add a `source` column on the event row (campaign / inbox / template / system).

6. **`number_ownership` empty + `partner_rates` empty** - the two SoT tables for the v1 payout function. The provider role works only because it uses a parallel mechanism (`bm_partner_assignments`). Decide on ONE attribution mechanism.

7. **`whatsapp_message_events` orphan rows** - 1,158 with NULL `whatsapp_number_id`, 1,132 with NULL `workspace_id`, 1,608 with NULL `message_id`. These come from events received before any matching `messages` row could be found (race) or where the `provider_message_id` mismatch happened. Backfill once, then add a nightly reconciler.

8. **`generate_payout_run` (no-role) still exists** - it pays $0 today and silently. Either delete it or make it fail loudly. `supabase/functions/manager-payout-report-pdf/index.ts` and `payout-report-pdf/index.ts` both still allow runs without a role.

9. **No canonical "delivered ever" by date for arbitrary range** - every page rolls its own date filter. No function `metrics_for_range(workspace_id, from, to)`.

10. **Recipient-status `failed` is permanent** - if Gupshup later sends a `delivered` event for the same `provider_message_id`, the webhook does not undo `failed`. Counts in `v_metrics_today` (`<>failed`) will then disagree with the event count by however many of those flip late.

---

## 6. Canonical metrics proposal

Adopt ONE event log (`whatsapp_message_events`) as the truth for delivery state and ONE recipient table (`campaign_recipients`) as the truth for send intent. Compute everything else from these two via two new database functions.

### Definitions (final)

| Metric | Definition (one sentence) | Source | Type |
|---|---|---|---|
| `attempted` | recipients where `sent_at IS NOT NULL` (we tried Gupshup at least once). | `campaign_recipients` | raw |
| `sent` | recipients where the latest known event is at least `sent` (i.e. status IN sent/replied OR an event row of type sent/delivered/read exists for the same provider_message_id). | recipients ∪ events | derived |
| `delivered` | distinct `provider_message_id` with any event_type IN (`delivered`,`read`) in window. | events | derived |
| `read` | distinct `provider_message_id` with event_type='read'. | events | derived |
| `failed` | distinct `provider_message_id` with terminal event_type='failed' AND no later non-failed event for the same id. | events | derived |
| `replied` (lead replied) | conversations with at least one inbound `messages` row in window. | messages | derived |
| `setter_first_reply` | conversations with `first_human_reply_at` in window. (renamed in UI from "replies today") | conversations | raw |
| `queued` | recipients where status IN (`pending`,`scheduled`,`sending`) (intent, not yet attempted). | recipients | raw |
| `skipped` | recipients dropped from a campaign at allocation time (need to be persisted - new column `campaign_dispatch_events.event_type='skipped'`). | events | raw |
| `partner_attributed_delivered` | distinct provider_message_id with delivered/read, joined via the chosen ownership mechanism (see below). | events × ownership | aggregated |
| `referral_attributed_delivered` | same, but restricted to numbers whose partner has `referrer_partner_id = X`. | events × ownership × partners | aggregated |
| `payable_amount` | for each (day, number, workspace): `delivered_in_period × partner_rate_at(...)`. | line items | aggregated |

### One attribution mechanism

Pick **`number_ownership`** as the canonical link (it already supports `effective_from/to`). Migrate `bm_partner_assignments`'s 6 active rows into per-number `number_ownership` rows (since BM ⇔ numbers is 1-to-many). Keep `bm_partner_assignments` as the *commercial* record (what we agreed with the partner about a BM) but stop using it directly in payout. This removes the dual-path inconsistency in `recompute_payout_run_role`.

### Should payout use sent or delivered?

**Delivered** for partner payouts (you only owe for what Meta confirmed reached the phone) and **delivered+read** for client billing (consistent with what we show clients). Currently both use delivered; that's fine - just make sure both paths use the exact same SQL filter `event_type IN ('delivered','read')` and dedupe by `provider_message_id` so multiple delivered+read events on one message count once.

### Source-of-truth tables we will write only via well-defined paths

- `whatsapp_message_events` - written only by `whatsapp-webhook`, `send-whatsapp` (sandbox-start), and the new reconciler.
- `campaign_recipients` - written only by `campaigns/index.ts` dispatch and the webhook.
- `payout_line_items` - written only by `recompute_payout_run_v2` (single new function).

---

## 7. Step-by-step implementation plan (safest order)

Each step is independently shippable and reversible.

### Phase A - normalize the event log (no UI change)

1. **Backfill `campaign_recipient_id` on events.** Migration: update `whatsapp_message_events` set `campaign_recipient_id = cr.id` from `messages m JOIN campaign_recipients cr ON cr.conversation_id = m.conversation_id` where `e.message_id = m.id` AND `e.campaign_recipient_id IS NULL`. Verify drop in NULL count.
2. **Backfill `whatsapp_number_id` and `workspace_id` on events.** Use `messages → conversations`. Re-run `trg_fill_event_workspace_number` logic as a one-shot UPDATE.
3. **Add `source` column to `whatsapp_message_events`** with values `campaign|inbox|template|system|unknown`. Backfill from `campaign_recipient_id IS NOT NULL → 'campaign'`, else `messages.sent_by_user_id IS NOT NULL → 'inbox'`, etc. This is what separates payable vs non-payable later.
4. **Harden webhook**: on `failed` event, only set recipient `status='failed'` if no later non-failed event exists for the same `provider_message_id` (so reorder-safe). `supabase/functions/whatsapp-webhook/index.ts:749-760`.

### Phase B - canonical metrics functions

5. **Create `metrics_for_range(workspace_id, from, to, partner_id NULL)`** returning `(sent, delivered, read, failed, replied, setter_first_reply, billable_delivered, payable_delivered)`. All future UI calls go through this.
6. **Rewrite `campaign_live_counts`** to drop the dead `'delivered','read'` recipient filter and instead pull delivered via the events table dedup'd by `provider_message_id`. Same shape, correct numbers.
7. **Rewrite `v_metrics_today` / `..._by_number` / `..._by_campaign` / `v_metrics_alltime`** to dedupe events by `provider_message_id` and to count `replies_today` as "lead inbound today" (not setter first reply). Rename the setter metric to `setter_first_reply_today` and surface it separately.
8. **Add unique constraint** so we cannot create two payout_line_items for the same (run, day, number, workspace).

### Phase C - repoint UI to canonical functions

9. Update `src/lib/portfolioMetrics.ts`, `WorkspaceOverview.tsx`, `AdminPanel.tsx`, `NumbersInventory.tsx`, `CampaignReportPanel.tsx`, `LatestReportCard.tsx`, `CampaignRuntimePanel.tsx`, `WorkspaceCampaigns.tsx`, `MessageIntegrityPanel.tsx`, `DispatchControlPanel.tsx`. Replace separate KPI queries with a single `metrics_for_range` call per page.
10. Add a small "Delivered (events)" vs "Sent (intent)" tooltip wherever both can disagree.

### Phase D - partner attribution

11. **Populate `number_ownership`** as a one-shot from `bm_partner_assignments` (provider role): for each (BM, partner, role='provider') write a `number_ownership` row per number under that BM with the same `effective_from`. Stop using `bm_partner_assignments` in payout SQL.
12. **Backfill `partner_rates`** from `partners.default_payout_rate_usd` (one `scope='default'` row per partner with `effective_from='-infinity'` or the partner's `created_at`).
13. **Rewrite `recompute_payout_run_role` → `recompute_payout_run_v2`** to: dedupe by `provider_message_id`, restrict to events with `source='campaign'`, use `number_ownership` for both `provider` and `referral` paths, and use `metrics_for_range` underneath. Old function stays but raises `NOTICE` directing to v2.
14. **Add a "drift report"** UI on each payout_run that calls `verify_payout_run` and surfaces stored vs live numbers. Admin can re-open the run as draft and recompute if drift > 0.

### Phase E - payout reporting

15. Update `payout-report-pdf` and `manager-payout-report-pdf` to read line items only (never recompute on the fly), so the partner PDF and the in-app numbers always match.
16. Build the partner/admin payout review UI on top of the now-correct numbers. (This is what you asked us *not* to start with.)

---

## 8. Quick wins (1-2 hours each)

- **Q1.** Backfill the three NULL columns on events (Phase A steps 1-2). Single migration. Immediately fixes the ~10% gap on dashboards.
- **Q2.** Fix the misleading "Replies today" label on `WorkspaceOverview.tsx:87` and `AdminPanel.tsx:242` to "Setter first reply today" until step 7 lands.
- **Q3.** Make the legacy no-role `generate_payout_run` raise an exception instead of silently producing $0 runs.
- **Q4.** Add a single SQL view `v_event_payable` = events of type `delivered` deduped by `provider_message_id` with `source='campaign'` join; expose it to admins so they can sanity-check totals.
- **Q5.** Backfill `number_ownership` from the 6 BM assignments. Even before step 11, this unblocks any referral testing.
- **Q6.** Add a `--verify` mode to `payout-report-pdf` that calls `verify_payout_run` and refuses to render if drift > 0.

---

## 9. What NOT to build yet

- Partner-facing payout dashboard / self-serve portal.
- New finance UI (`FinancePartners`, `FinanceRunDetail`) on top of current numbers - they will look authoritative while still being wrong.
- Slack auto-posting of payouts (`slack-payout-post`) - leave disabled until Phase D ships.
- Any feature that multiplies stats (cost-per-reply, ROAS, predicted payout) - these inherit all current errors.
- Multi-tier referral.
- Approval automations on payout runs.

---

## Sign-off questions before implementation

1. Confirm: payable basis is **delivered (delivered+read deduped)**, not sent. Yes/no?
2. Confirm: payout pays partners **only for `source='campaign'` events** (manual inbox sends and quick-template re-engagements are not paid). Yes/no?
3. Confirm: we standardize on `number_ownership` and migrate the 6 `bm_partner_assignments` rows into it. Yes/no?
4. For Iskra workspace specifically, do you want the backfill to start from `created_at` of each number, or from a date you'll provide?
