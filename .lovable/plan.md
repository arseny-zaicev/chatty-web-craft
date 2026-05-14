Cleanup of the Partner detail page (`/admin/partners/:id`) so all BM management happens inline, plus a branding/stats audit of the payout PDFs.

## 1. Linked Business Managers table - inline management

File: `src/pages/admin/PartnerDetail.tsx` (Business Managers tab).

- **Remove the Verification column** (drop `<VerificationSelect>` and the `Verification` header/cell). The `VerificationSelect` helper can stay defined or be removed; verification stays editable elsewhere only if you still want it - confirm in step 7 below.
- **Lifecycle column → editable Status select.** Replace the read-only `<Badge>` with a `<Select>` bound to `business_managers.status`. Options: `ready`, `warming_up`, `verifying`, `disabled`, `active`, `paused` (the values already used by `BusinessManagerDetail`). On change: update `business_managers.status` (and set `warmup_started_at = now()` when switching into `warming_up` if it's null), then invalidate `partner-bms` + `business-managers`.
- **Warm-up column → editable.** Inline `<Select>` for `warmup_stage` (free text or quick presets: "Day 1-3", "Day 4-7", "Week 2", "Ready") and a small date input for `next_warmup_run_date`. Persist to `business_managers`.
- **New "Numbers" inline editor.** In the Numbers cell (which currently just shows count) add a small "+ Add" button that opens a popover/dialog listing unassigned `whatsapp_numbers` (no `business_manager_id`, optionally scoped to the BM's workspace if set). Selecting one or more numbers updates `whatsapp_numbers.business_manager_id = bm.id`. Reuse the same query the existing `CreateBMDialog` uses (`numbers-for-bm-create`). After mutation invalidate `partner-numbers` and `partner-bms`.

## 2. Remove the standalone BM detail "complex" page from this flow

- **Stop linking to `/admin/business-managers/:id`** from the Partner detail BM table. Remove the `<Link to={...}>` wrapper around the BM name (keep it as plain text + meta id).
- The route itself stays (it's still used from `BusinessManagers.tsx`), but partner-flow users never land on it.

## 3. Remove the "Numbers" tab

- Delete the `<TabsTrigger value="numbers">` and the entire `<TabsContent value="numbers">` block. Default tab stays `bms`.
- The aggregate counts already live in the top stat strip; the per-BM numbers list is now editable inline (step 1).

## 4. Reports (Finance & Reports tab) - branding + correctness audit

Files to audit:
- `supabase/functions/payout-report-pdf/index.ts`
- `supabase/functions/manager-payout-report-pdf/index.ts`
- `supabase/functions/_shared/brand.ts`

Actions:
- Standardize header on the same Iskra brand block used elsewhere (`_shared/brand.ts`). `manager-payout-report-pdf` currently hard-codes `"Iskra · WhatsApp Outreach"` on line 122 - replace with the shared header helper so both PDFs match.
- Sweep both files for: em-dashes (`—`) → short hyphens, "Base Reactivation" → "Database Reactivation", any "money-back"/refund copy (must be removed), and stray placeholder text.
- Verify per-number stats in both PDFs match what the UI shows: confirm we aggregate from the same source as `number_live_stats` / `liveByNum` (sent today / 7d / all-time), not stale `whatsapp_numbers` counters. Fix any column whose totals don't reconcile against the top stat strip on the Partner detail page (`Sent today`, `Sent 7d`, `Sent all-time`).
- Check that "Restricted" / "Blocked" counts in the PDF use the same status set as `PartnerDetail` (`restricted`, and `blocked || banned`).

I'll list any discrepancies I find as I work and fix them in the same pass; no schema changes expected.

## Out of scope

- No DB migrations.
- No changes to `BusinessManagerDetail.tsx` itself, `FleetRegistry`, `FleetAnalytics`, or the global Business Managers list - only the Partner detail flow is simplified.
- Verification field stays in the database; we're only removing it from this one table. Confirm if you want it removed from the BM detail page too.

## Question before I build

Two quick confirms:
1. For status options in the inline Status select, OK to use `ready / warming_up / verifying / disabled / active / paused`? Or keep just the 4 lifecycle buckets (`ready / warming_up / verifying / disabled`)?
2. When adding numbers inline, should I restrict the picker to numbers in the BM's workspace only, or show all unassigned numbers across workspaces (and infer/overwrite workspace from BM)?
