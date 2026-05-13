## Goal

Fix four operator pain points in the Partner / BM area:

1. Verification status on Linked Business Managers is read-only — must be editable.
2. Payout runs cannot be deleted — admin needs a delete control.
3. Partner / Referrer PDFs are not branded, still use cryptic short labels, and lack the per-day breakdown the partner needs to read on their own.
4. "Delivered 219" on a payout run vs "Sent 1742" on the same BM looks like a bug — actually two different metrics over two different windows, with no UI hint. Make them comparable.

This plan does not redesign anything else.

---

## A. Editable BM verification

**Where:** `src/pages/admin/PartnerDetail.tsx` (Linked Business Managers table, "Verification" column) and `src/pages/admin/BusinessManagerDetail.tsx` header.

**Change:** Replace the read-only `Badge` with an inline `Select` (values: `unverified`, `verifying`, `verified`). On change, call `supabase.from("business_managers").update({ verification_status }).eq("id", bm.id)`, optimistic update, toast, invalidate `["business-managers"]` + `["admin", "partner-assigns", id]`.

RLS is already in place (`is_workspace_manager` allows updates); no migration needed.

---

## B. Delete payout runs

**Where:** `src/pages/admin/PartnerDetail.tsx` Payout-runs table row, and `src/pages/admin/FinanceRunDetail.tsx` header.

**Rules (operator safety):**
- Allow delete only when `status IN ('draft','void')`.
- For `approved` / `paid` runs, the button is hidden and a small note explains "Void first to delete".
- Confirmation dialog ("Delete run permanently? Line items, audit, and PDF/CSV files will be removed.").

**Backend:**
- DB: RLS already permits `Admins manage payout runs` ALL, and `payout_line_items` cascades on `payout_run_id`. So a direct `supabase.from("payout_runs").delete().eq("id", id)` works.
- Storage cleanup: also delete the PDF/CSV objects under `payout-reports/<partner_id>/...` listed on the row (`pdf_storage_path`, `csv_storage_path`, `partner_pdf_storage_path`). Best-effort, ignore not-found.

No migration needed.

---

## C. Branded, partner-friendly PDFs

Both `supabase/functions/payout-report-pdf/index.ts` (mode=`partner`) and `supabase/functions/manager-payout-report-pdf/index.ts` get the same brand pass.

### C.1 Brand and layout

- Header band in Craft-Champagne `#F5EFE3` with Emerald `#0F5132` accent rule; logo wordmark "Iskra" in bold serif-style (jsPDF only ships core fonts, so we use `helvetica` bold at large size with the Emerald color — no external font fetch, keeps the function fast and offline-safe).
- Subtitle "WhatsApp Outreach - Partner statement".
- Partner name + email in body color, period in Dubai local format (`12 May 2026 - 13 May 2026`) instead of ISO arrows.
- Footer with single Emerald rule, contact line "Questions? reply@iskra.ae", page numbers `1 / N`.

### C.2 Plain-English labels (no abbreviations)

Replace every short label with the spelled-out version on the partner-facing PDF only (internal mode keeps the dense labels):

| Old label | New label |
|---|---|
| `P. rate` / `Partner rate` | `Rate per delivered message` |
| `C. rate` / `Client rate` | (removed from partner PDF) |
| `Delivered` | `Messages delivered` |
| `Failed` | `Messages failed` |
| `Sent` | (removed from partner PDF totals; only daily breakdown shows it as "Attempts") |
| `Partner payout` | `Your earnings` |
| `Manager rate` | `Your referral rate` |
| `Your referral earnings` | unchanged |

### C.3 Rate is shown spelled out

Below the totals box, add one line:

> Your rate for this period: **$0.0050** per delivered message (zero point zero zero five US dollars)

Computed from the partner_rate of the run (or `referral_rate_usd` for manager PDF). If multiple rates appear in the period, show "Mixed rates - see daily breakdown".

### C.4 Per-day breakdown is the headline section (partner PDF)

Make the daily table the primary table, with these columns:

`Day | Active numbers | Messages delivered | Your earnings`

`Active numbers` = distinct `whatsapp_number_id` count per `day` from `payout_line_items`. Earnings per day = `SUM(payout_usd)` per `day`. Add a foot row with totals.

The existing per-number summary stays but moves below as a secondary table titled "Numbers worked in this period" with columns: `Number | Days active | Messages delivered | Your earnings`.

### C.5 Manager (referrer) PDF gets a per-day section too

Currently the manager PDF only shows totals + per-partner. Add a "Daily breakdown" table aggregated across the manager's own numbers + every downline:

`Day | Source (You / <partner name>) | Messages delivered | Earnings type | Earnings`

This is one PDF the manager can hand-read and reconcile with their team chat. No separate per-partner PDF needs to be sent.

### C.6 Branding constants

Put colors and labels in a small shared module `supabase/functions/_shared/brand.ts` so both functions reference the same palette and copy. Keep all colors HSL-translated to RGB tuples for jsPDF.

---

## D. Delivered vs Sent reconciliation

The "delivered 219" vs BM "sent 1742" disconnect is two real things, not a bug:

- Payout run "Delivered" counts `whatsapp_message_events.event_type='delivered'` over `[period_from, period_to]`.
- BM "Sent today / 7d / all" comes from `v_metrics_today_by_number` / `v_metrics_alltime` over fixed today / rolling 7d / all-time windows, and counts attempts (sent), not delivered confirmations.

Plan to make them readable side-by-side:

### D.1 Add "Messages sent (attempts)" to the payout run header

`payout_runs.totals_sent` already exists. Show it next to Delivered on the partner PDF totals (under a discreet label "Attempts in period") and on `FinanceRunDetail.tsx` so admins immediately see both numbers without opening BM page. Also add a tooltip: "Attempts = messages we tried to send. Delivered = messages WhatsApp confirmed reaching the contact. Earnings are paid on Delivered only."

### D.2 Add a period filter to the BM "Sent" columns

Currently the BM card on Partner Detail shows fixed `Sent today`, `Sent 7d`, `Sent all`. Add a small date-range picker at the top of the BMs tab; when set, the columns become `Sent in period`, `Delivered in period`, `Replies in period`, computed from `v_metrics_*_by_number` filtered by date if available, otherwise from `whatsapp_message_events` aggregated. The same range pre-fills the "Generate draft run" form below so an operator clicks Generate and gets a run for the same window they were just looking at.

This single change makes the "1742 vs 219" question disappear: same window, both numbers visible, with the explanation that one is attempts and one is confirmed deliveries.

### D.3 In-PDF cross-check footer

Partner-facing PDF gets one extra footer line:

> Statement covers attempts (`totals_sent`) and confirmed deliveries (`totals_delivered`). Earnings are paid per confirmed delivery.

---

## Order of work

1. **A** (verification editor) - 30 min, no migration.
2. **B** (delete runs + storage cleanup) - 1h.
3. **D.1** (Attempts on PDF header + Run detail) - 30 min, makes "1742 vs 219" intelligible immediately.
4. **C** (branded PDF + plain labels + per-day primary table + manager per-day) - half a day.
5. **D.2** (date-range on BM tab, prefills run generator) - 1.5h.
6. **D.3** (footer line) - 5 min, comes free with C.

No database migrations. No new edge functions. Existing RLS already allows all the writes.

## Out of scope

- Renaming internal admin labels (still dense by design).
- Custom font embedding in PDF (would slow cold start; helvetica + color is enough for brand recognition).
- Reworking the underlying delivered/sent metrics pipeline.
- Sending PDF by email - manual download + share for now.

## Open questions to confirm before building

1. Should deletion be allowed on `approved` runs (after explicit "void then delete"), or only on `draft`/`void`? (Default in plan: only draft / void.)
2. For the manager PDF, should each downline still have an individual section, or is "Daily breakdown" + "Per-partner totals" enough? (Default in plan: drop the individual sections, keep one combined daily table + per-partner totals.)
3. Confirm the partner PDF should hide `Client rate`, `Client billed`, `Our margin` entirely (yes, per the previous round, but flagging because the current internal-mode CSV still exposes them and that is fine).
