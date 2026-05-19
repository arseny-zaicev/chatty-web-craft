
# Stats & Payout Foundation Audit

## 1. Executive summary

The stats foundation is **not trustworthy enough to pay partners on right now**, and you already know it — the `Reconciliation` page exists precisely because we know webhooks drift. The structural problem is bigger than that page admits:

- There are **at least 4 incompatible definitions of "sent"** in this codebase, returning different numbers for the same campaign on the same day.
- There are **2 incompatible definitions of "failed"**.
- "Delivered", "read" and "replied" are only partially aggregated; "queued / cancelled / blocked / skipped" are not modelled as metrics at all.
- Payouts (`recompute_payout_run_role`) are computed from `whatsapp_message_events.delivered`, but most UI cards show numbers derived from `campaign_recipients.status` or the cached counter `campaigns.sent_count`. Operators see one truth, finance pays on another, and there is no enforced reconciliation gate before approving a run.
- Historical data is mostly reconstructable for `sent / delivered / failed / read`, but `replied` and partner attribution at event time have gaps that need explicit backfill rules.

Concrete drift visible in the DB **right now** (production data):

| Source | "sent" | "failed" |
|---|---|---|
| `campaigns.sent_count` (cached counter)             | **6 300** | 1 055 |
| `campaign_recipients` with `sent_at` and `status<>'failed'` (used by `v_metrics_today`) | **6 318** | — |
| `campaign_recipients.status IN ('sent','delivered','read')` (used by `campaign_live_counts`) | **5 357** | 1 656 |
| `whatsapp_message_events event_type='sent'` (used by reconciliation + payouts) | **7 256** | 1 686 |

Difference between the smallest and largest "sent" reading is **~35%**. Same DB, same instant.

That is the headline. Everything below is the map and the fix.

## 2. Current source-of-truth map

### Tables and views that hold raw signal
- `campaign_recipients(status, sent_at, error_message, provider_message_id)` — one row per intended send; mutated by `send-whatsapp` / `campaigns` edge and by the webhook.
- `whatsapp_message_events(event_type, received_at, workspace_id, whatsapp_number_id, campaign_recipient_id, raw)` — append-only log written by `whatsapp-webhook` (delivered/read/failed/sent/enqueued/sandbox-start) and `send-whatsapp` (sent).
- `messages(direction, created_at, conversation_id, status)` — inbound/outbound message log; only place where inbound = reply lives.
- `conversation_insights(reply_intent, reply_sentiment, first_reply_at, time_to_first_reply_seconds)` — AI-tagged reply state.
- `campaigns.sent_count / failed_count / today_recipients_count / last_day_completed_date` — denormalised counters maintained by edge code.
- `campaign_number_allocations.sent_count` — per-(campaign, number) counter used by the dispatcher.
- `whatsapp_message_events.event_type='enqueued'` — the only thing that resembles a "queued" metric, and it is not surfaced.

### Aggregations that read those tables
| View / RPC | Defines "sent" as | Defines "failed" as | Notes |
|---|---|---|---|
| `v_metrics_today`, `v_metrics_today_by_number`, `v_metrics_today_by_campaign`, `v_metrics_alltime` | `campaign_recipients` rows with `sent_at` and `status <> 'failed'` | `status = 'failed'` (only `today` view) | Workspace overview KPIs, NumbersInventory, partner cards in `PartnerDetail`, BM card in `BusinessManagers`. **Buckets `replied` into `sent`** which is correct, but inconsistent with the next row. |
| `campaign_live_counts` (RPC) | `status IN ('sent','delivered','read')` — **excludes `replied`** | `status = 'failed'` | Drives `CampaignRuntimePanel`, the per-campaign live card. Under-counts every campaign with any reply. |
| `campaign_recipient_counts` (RPC) | `status = 'sent'` only — **excludes `delivered`, `read`, `replied`** | `status = 'failed'` | Used by some operator views. Under-counts active campaigns. |
| `campaigns.sent_count` counter (`campaigns/dispatch_helpers.ts`) | incremented at send time on the cached row | `failed_count` incremented on failure | Used by `WorkspaceOverview`, `LatestReportCard`, `FleetAnalytics`, `campaigns.ts` grouping. Drifts when rows are retried, status is patched by the webhook, or campaigns are cancelled. |
| `admin_reconcile_*` (RPCs) and `Reconciliation.tsx` | event-side: `whatsapp_message_events.event_type='sent'` vs recipient-side: `status IN ('sent','delivered','read')` | event vs `status='failed'` | The page already calls out this drift but does not block payouts. |
| `recompute_payout_run_role` (provider + referral) | not used | `whatsapp_message_events.event_type IN ('delivered','failed','sent')`, **payout only on `delivered`** | This is the de facto source of truth for billing. Disagrees with every UI card. |
| `FleetAnalytics.tsx` | client-side loop over paginated `whatsapp_message_events` | same | Computes everything in the browser. Fragile, slow, and silently caps at the 1000-row Supabase limit unless paged correctly. |

### Where "delivered" comes from
**Only one source: `whatsapp_message_events.event_type='delivered'`.** It is correctly used by payouts and the alltime view. It is **not** surfaced on per-campaign live UI, not in `campaign_live_counts`, not in `campaigns.sent_count`. That is why your campaign page shows "sent / errors" but no final delivered count.

### Where "read" comes from
`whatsapp_message_events.event_type='read'` only. Not aggregated in any view. UI computed ad-hoc only in `FleetAnalytics`.

### Where "replied" comes from
Two parallel sources:
- `campaign_recipients.status='replied'` (set by webhook when a reply lands on a recipient row).
- `messages.direction='inbound'` joined back through `conversations` (used by `v_metrics_today.replies_today` and `campaign_live_counts.replied`).
These two definitions disagree: `status='replied'` counts the **recipient** once, the `messages` join counts **every** inbound message and multiplies by reply frequency. `v_metrics_today.replies_today` is therefore inflated relative to recipient-level reply rate.

### Where "queued / cancelled / blocked / skipped" come from
- `enqueued` events exist (9 276 rows) but no metric reads them.
- `campaign_recipients.status` enum has `pending`, `scheduled`, `sending` (treated as "queued" by `campaign_live_counts.pending`), and no explicit "cancelled" / "skipped". Cancellation today is implicit (parent campaign status flips, sibling rows are not counted).
- `campaign_dispatch_events` records skips / kill-switch / overflow but is not aggregated anywhere.

### Per partner / per number / per workspace / per date range
- Per number today/all-time: `v_metrics_today_by_number` + `v_metrics_alltime` ✅ consistent within themselves.
- Per workspace: `v_metrics_today` / `v_metrics_alltime` ✅ consistent.
- Per campaign: **three different RPCs**, see table above — inconsistent.
- Per partner: derived in `src/lib/metrics.ts → fetchPartnerMetrics` by walking `number_ownership` rows with `effective_to IS NULL` ("current owner") and summing per-number metrics. This is wrong for any historical range: a number that changed owner mid-period is fully credited to the current owner instead of being split by `effective_from/effective_to`.
- Per date range: there is **no general "between dates" view**. The only ranged primitives are `v_metrics_today` (today only) and `v_metrics_alltime` (cumulative). Anything else is bespoke client-side aggregation (FleetAnalytics, Reconciliation).

## 3. Historical reliability assessment

Event counts in `whatsapp_message_events` today: `enqueued 9276 · sent 7256 · delivered 7083 · read 4283 · failed 1686 · sandbox-start 41`.

What we can trust historically:
- **delivered** (per number, per workspace, per day): trustworthy back to whenever `whatsapp-webhook` started writing events. `received_at` is server-side, `whatsapp_number_id` is filled via the `trg_fill_event_workspace_number` trigger.
- **failed** events: trustworthy in the same window. Note the discrepancy with `campaigns.failed_count` is the cached counter being stale, not events being missing.
- **sent** events: trustworthy from `send-whatsapp` writing the event at the moment of provider acceptance. The drift vs `campaign_recipients.status` is a *recipient-state* lag, not an event-log gap.
- **read**: trustworthy where the user opted-in receipts. Read-deltas vs delivered (~60% read rate) look normal.

What can be backfilled:
- A canonical "sent / delivered / failed / read by day × number × workspace × campaign" rollup can be rebuilt deterministically from `whatsapp_message_events` for the full period the table covers. Bind to campaign via `campaign_recipient_id` (already on the event row).
- Partner attribution can be backfilled correctly by joining each event to `number_ownership` using `received_at BETWEEN effective_from AND COALESCE(effective_to, now())` (the `number_owner_at(_id, _at)` SQL helper already exists and the payout function already uses it).
- Workspace billing rate at event time exists via `workspace_billing_rate_at(_ws, _at)` (used in payouts).

Real data gaps that need an explicit decision:
- **`campaign_recipient_id` link rate on events**: some early `sent` events were written before the recipient-id was populated. Need a backfill pass that re-binds events to recipients via `(whatsapp_number_id, provider_message_id)` and falls back to `(whatsapp_number_id, contact_phone, received_at±N min)`. Any event that still has no recipient after backfill must be flagged "unattributable" and excluded from payout.
- **Replies before `conversation_insights`** existed: `first_reply_at` is NULL for historical conversations. Cheap backfill: `MIN(messages.created_at WHERE direction='inbound')` per conversation.
- **Cancelled / superseded recipients**: nothing distinguishes "we deliberately cancelled this row" from "we never got around to it". Need a `cancelled_at` column or a status value, plus a one-shot migration to mark historical orphans.
- **`number_ownership` start date**: any number that existed before the first ownership row is unattributable for that prior period. A migration should backfill ownership starting at the number's `created_at` for the partner it was originally provisioned to (read from `whatsapp_numbers.provided_by` or current owner if no other signal).

What cannot be repaired without assumptions:
- True "queued duration" history (we never wrote enqueue→send timestamps consistently).
- True provider-side error categorisation before we started parsing `raw` (we have `error_code` / `error_message` only on newer rows).
- Partner attribution for any event where `whatsapp_number_id` was never resolved (small number — the trigger has been running for most of history).

## 4. Partner / referral payout readiness

Current state:
- `partners` (kind = provider | referral | both, `referrer_partner_id` for referrals, `referral_rate_usd`, `default_payout_rate_usd`).
- `partner_rates` (scope = default | number | workspace, effective dating).
- `number_ownership` (effective dating, the legitimate source of "who owned this number when").
- `bm_partner_assignments` (role + rate per BM, effective dating).
- `payout_runs` + `payout_line_items` (frozen totals; `guard_payout_run_freeze` protects post-approval edits).
- `recompute_payout_run_role` already implements the right idea: aggregate `delivered` events in `[period_from, period_to]`, attribute by `number_owner_at(number, received_at)`, price with `workspace_billing_rate_at`.

What prevents accurate payouts today:
1. **No reconciliation gate before approval.** Operators can approve a run while `admin_reconcile_daily` shows drift. The drift today (recipients-sent 6 318 vs events-sent 7 256, ~13%) means hundreds of deliveries can be silently mis-attributed.
2. **Referral attribution uses *current* referee set** (`partners.referrer_partner_id`), not the referee set at event time. If a referrer relationship changes, historical payouts will recompute differently. Need to add `effective_from/effective_to` to the referrer link, or freeze the referee list onto the `payout_run` at generation.
3. **No `payout_unattributable_events` ledger.** Today, events with NULL `whatsapp_number_id` or whose owner was NULL at the time are silently dropped by the join. That money disappears instead of being surfaced for manual resolution.
4. **No "billed but not paid"/"paid but not billed" view.** `workspace_billing_rate_at` may move; nothing reconciles the workspace's invoiced totals against the events the workspaces was billed for.
5. **Partner-side UI in `PartnerDetail` displays `sent_today` from `v_metrics_today_by_number`** while finance pays on `delivered`. Partners reading the page see a different number than what they will be paid for.
6. **`number_ownership` does not enforce non-overlapping intervals.** Two active rows for the same number both with `effective_to IS NULL` would double-count. Needs an exclusion constraint.
7. **No idempotency on `delivered` events.** Webhook may deliver duplicates for the same `provider_message_id` + `event_type`. Need a unique index `(provider_message_id, event_type)` (partial where not null) and a backfill dedupe.

Concrete fix order is in §7.

## 5. Highest-risk gaps

1. **Three definitions of "sent" coexist.** `campaigns.sent_count` (6 300), `v_metrics_today` (6 318), `campaign_live_counts` (5 357), `whatsapp_message_events` (7 256). Files: `supabase/migrations/*` (the views), `supabase/functions/campaigns/dispatch_helpers.ts`, `src/lib/campaigns.ts`, `src/components/workspace/CampaignRuntimePanel.tsx`.
2. **No per-campaign delivered surface.** `campaign_live_counts` returns no `delivered`. The campaign card cannot show what was actually delivered. Fix in the same RPC.
3. **Partner per-period metrics use *current* owner.** `src/lib/metrics.ts::fetchPartnerMetrics` filters `number_ownership` by `effective_to IS NULL`. Wrong for any historical or end-of-month view.
4. **`replies_today` double-counts inbound messages.** `v_metrics_today` sums every inbound `messages` row. Should be `COUNT(DISTINCT conversation_id WHERE first_human_reply_at IS NOT NULL)` for that day.
5. **Cached counters drift.** `campaigns.sent_count` is not authoritative. Either remove it from UI or rebuild it from events nightly with a deterministic job. Files: `campaigns/dispatch_helpers.ts`, `WorkspaceOverview.tsx`, `LatestReportCard.tsx`, `FleetAnalytics.tsx`.
6. **`FleetAnalytics` aggregates in the browser** with paginated `whatsapp_message_events` reads. Slow, bypasses RLS-safe materialisation, will silently cap at 1000 rows per page on a slow link. Move to a server-side `v_fleet_daily` rollup.
7. **No reconciliation drift gate on payout approval.** `approve_payout_run` does not call `admin_reconcile_daily` for the same period. Add a precondition.
8. **No `cancelled` recipient state.** Cancelled siblings count as `pending` in `campaign_live_counts`. Add an enum value or a `cancelled_at` column and exclude.
9. **Referral attribution snapshot missing.** `recompute_payout_run_role` reads `referrer_partner_id` live. Snapshot the referee set onto the run at generation.
10. **No unique index on `(provider_message_id, event_type)`** in `whatsapp_message_events`. Duplicate webhook deliveries are not deduped.

## 6. Canonical metrics proposal

Define one source per metric, name it once, use it everywhere. Every UI card and every payout function reads the same primitive.

| Metric | Definition (canonical) | Source | Storage |
|---|---|---|---|
| **queued** | `campaign_recipients` rows with `status IN ('pending','scheduled','sending')` that have **not** been `cancelled_at` | `campaign_recipients` (after adding `cancelled_at`) | Derived live, cheap |
| **sent** | `whatsapp_message_events` rows with `event_type='sent'`, deduped by `(provider_message_id, event_type)`, joined to a recipient | `whatsapp_message_events` | Aggregated nightly into `metrics_daily` |
| **failed** | `whatsapp_message_events` rows with `event_type='failed'`, same dedupe | `whatsapp_message_events` | Aggregated nightly |
| **delivered** | `whatsapp_message_events` rows with `event_type='delivered'`, same dedupe | `whatsapp_message_events` | Aggregated nightly. **This is the only number finance pays on.** |
| **read** | same, `event_type='read'` | `whatsapp_message_events` | Aggregated nightly |
| **replied** | `COUNT(DISTINCT conversation_id)` whose `conversations.first_human_reply_at` falls in the bucket | `conversations` | Aggregated nightly |
| **cancelled / skipped** | `campaign_recipients` with `cancelled_at IS NOT NULL` (operator) OR `campaign_dispatch_events.event_type='skip'` (system) | both | Aggregated nightly |
| **partner-attributed (provider)** | `delivered` × `number_owner_at(number_id, received_at)` × `partner_rate_at(...)` (already implemented) | join | Live in `recompute_payout_run_role`; materialised at payout-run generation |
| **referral-attributed** | same `delivered`, but `owner ∈ snapshot_referee_set(run_id)` × `partners.referral_rate_usd` snapshot | join | Materialised at payout-run generation |
| **payable amount (USD)** | `SUM(delivered × partner_rate)` over the period, after reconciliation drift check passes | rollup | Frozen in `payout_runs.total_payout_usd` |

Cached counters (`campaigns.sent_count`, `campaigns.failed_count`, `campaign_number_allocations.sent_count`) become **operational hints only** — never displayed as "the number". They are useful for the dispatcher's per-day cap logic and nothing else.

The "per number / per workspace / per campaign / per date range" cuts all come from one rollup: `metrics_daily(day, workspace_id, whatsapp_number_id, campaign_id, sent, delivered, failed, read, replied)` — a materialised view refreshed every 5 minutes plus a stream-update trigger on `whatsapp_message_events`.

## 7. Implementation plan (safe order)

Each step is small, reversible, and ends with a verifiable check.

### Phase 1 — make the foundation honest (no UI changes)
1. **Add dedupe constraint.** Unique partial index `whatsapp_message_events (provider_message_id, event_type) WHERE provider_message_id IS NOT NULL`. Backfill: delete duplicates keeping `MIN(received_at)`. Verify `admin_reconcile_summary` deltas shrink.
2. **Backfill `campaign_recipient_id` on events** by `(whatsapp_number_id, provider_message_id)` then `(whatsapp_number_id, contact_phone, received_at±5min)`. Log anything still unbound into a new `unattributable_events` view.
3. **Backfill `conversations.first_human_reply_at`** from `MIN(messages.created_at WHERE direction='inbound')`.
4. **Add `campaign_recipients.cancelled_at timestamptz`** + migration to mark recipients whose parent campaign is `cancelled` and that never got `sent_at`.
5. **Enforce non-overlap on `number_ownership`** with an `EXCLUDE USING gist` constraint.
6. **Snapshot referee set on payout-run generation.** Add `payout_runs.referee_partner_ids uuid[]`; `recompute_payout_run_role` reads from the snapshot for `referral` runs.

### Phase 2 — one canonical rollup
7. **Create `metrics_daily` materialised view** keyed `(day, workspace_id, whatsapp_number_id, campaign_id)` with `sent / delivered / failed / read / replied / cancelled`. Refresh every 5 min from cron + on-demand RPC `refresh_metrics_daily(day)`.
8. **Replace the four existing views** (`v_metrics_today*`, `v_metrics_alltime`) with thin wrappers over `metrics_daily` so old call sites keep working but read consistent numbers.
9. **Rewrite `campaign_live_counts`** to: `total = recipients`, `queued = pending+scheduled+sending excl. cancelled`, `sent / delivered / failed / read = SUM(metrics_daily) for this campaign`, `replied = COUNT(DISTINCT conv with first_human_reply_at IS NOT NULL)`. Drop the divergent `campaign_recipient_counts` RPC.

### Phase 3 — reconciliation gate
10. **Add `admin_reconcile_drift(period_from, period_to)`** returning a single % per workspace × number.
11. **`approve_payout_run`** must raise if drift > a configurable threshold (default 1%). The Reconciliation page becomes a hard gate, not advisory.
12. **Introduce `unattributable_events_ledger`**: a view that lists events that would have been included in a payout but had no resolvable owner. The payout dashboard surfaces a count; approval is blocked while count > 0 for the period.

### Phase 4 — fix UI consumers, in this order
13. `src/lib/metrics.ts::fetchPartnerMetrics` — replace `effective_to IS NULL` filter with date-aware `number_owner_at` join; same for `fetchBmMetrics`.
14. `WorkspaceOverview`, `LatestReportCard`, `CampaignRuntimePanel`, `NumbersInventory`, `Partners`, `PartnerDetail`, `BusinessManagers`, `FleetAnalytics` all switch to `metrics_daily` wrappers. **`campaigns.sent_count` removed from every display.** Per-campaign card finally shows `sent / delivered / failed / read / replied / payable $`.
15. Move `FleetAnalytics` aggregation to a server-side RPC `fleet_analytics(period)` returning the same shape — kill the browser loop and the 1000-row hazard.

### Phase 5 — partner / referral earnings UI (only now)
16. Build the partner earnings screens **on top of `metrics_daily` + reconciliation gate + snapshot referees**. By construction they will agree with what `recompute_payout_run_role` will pay.

## 8. Quick wins (1-2 hours each, do today)

- Add the unique partial index on `whatsapp_message_events (provider_message_id, event_type)` and the duplicate-purge query. Immediate trust improvement in `Reconciliation`.
- Patch `campaign_live_counts` so `sent` includes the `replied` status (`status IN ('sent','delivered','read','replied')`). Stops under-counting active campaigns by ~16% on the current dataset (990 replied / 6 318 sent).
- Add `delivered_count` and `failed_event_count` columns to `campaign_live_counts` (read directly from `whatsapp_message_events`). The campaign card finally shows a delivered number — zero schema migration.
- Patch `v_metrics_today.replies_today` to count `DISTINCT conversation_id` whose `first_human_reply_at` falls today, instead of summing inbound messages.
- Add a banner on `Reconciliation` that links to the payout runs that overlap the drifting period.

## 9. Medium tasks (the real refactor)

- The whole of Phase 1 + Phase 2 above (`metrics_daily`, dedupe, backfill, referee snapshot, cancelled state).
- Replace cached `campaigns.sent_count` writes with a nightly recompute from `metrics_daily`. Keep the column for the dispatcher's daily-cap arithmetic, mark it `-- internal, do not display`.
- Rewrite `fetchPartnerMetrics` / `fetchBmMetrics` to use period-aware ownership joins.
- Server-side `fleet_analytics` RPC + delete the browser loop in `FleetAnalytics.tsx`.
- Make `approve_payout_run` block on drift + unattributable events.

## 10. What NOT to build yet

- **Partner-facing earnings dashboard.** Building it now means it will disagree with every other partner card and with the eventual paid amount. Wait for Phase 2.
- **Public/external partner portal.** Same reason — also requires the referee snapshot.
- **Automated payout posting to Slack / partner email** for amounts derived from the current pipeline. Currently auto-generated runs (`auto_generated=true`) can fire with drift > 10% silently. Pause automatic posting until the reconciliation gate is in.
- **A/B testing / CTR / variant-winner analytics** referenced in `Roadmap.tsx`. They need the canonical `delivered/read/replied` per campaign to be meaningful.
- **Re-billing past invoices** based on "newly reconciled" deliveries until we have the unattributable-events ledger and an explicit policy for late-arriving webhooks.

---

Once Phase 1-3 ship, every card in the app reads from `metrics_daily`, every payout reads from `metrics_daily` filtered through `number_owner_at` + snapshot referees, and the Reconciliation page becomes a blocking gate instead of an advisory dashboard. That is the point at which it is safe to start building the partner earnings UI you actually want.
