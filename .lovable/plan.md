## Goal

1. One trustworthy rate everywhere (fix display bug).
2. Plain-English labels.
3. Partner-facing PDF that hides all internal info (no client rate, no billed, no margin).
4. Manual control over both **partner rate** and **manager rate** (today called "referral rate").
5. Two separate downloadable PDFs from the run page:
   - **Partner PDF** — only this partner's own numbers and own payout. No mention of the manager / upline.
   - **Manager PDF** — one consolidated report for the manager covering their own numbers + every partner attached to them in the period, with each attached partner's payout shown as a line.

---

## Part A — Fix rate truth (display bug)

Math is correct in the DB. The PDF formats rates with a 2-decimal money formatter, so `0.005` renders as `$0.01`. The UI uses `.toFixed(4)` and shows `$0.0050`. Same row, different format.

Fix: add `fmtRate` (4 decimals) and use it everywhere a `$/delivered` rate is rendered:
- `supabase/functions/payout-report-pdf/index.ts`
- `src/pages/admin/FinanceRunDetail.tsx`
- `src/pages/admin/FinancePartnerDetail.tsx`, `PartnerDetail.tsx`, `Partners.tsx`

`fmtUsd` (2 decimals) stays only for total amounts.

Document precedence already implemented in `partner_rate_at()`: **number override → workspace override → partner default**. Surface this as a tooltip in the run detail page.

---

## Part B — Plain-English labels

Rename in UI + PDF + CSV:

| Old | New |
|---|---|
| P. rate | Partner rate ($/delivered) |
| C. rate | Client rate ($/delivered) — internal only |
| Payout | Partner payout |
| Billed | Client billed — internal only |
| Margin | Our margin — internal only |
| Referral rate | Manager rate ($/delivered) |
| Referrer | Manager |

Wherever the current UI says "Referral / Referrer / Ref", switch to "Manager".

---

## Part C — Manual control over partner & manager rates

Today partners.referral_rate_usd is editable in `PartnerDetail.tsx`. Keep that. Make sure both fields are obviously editable on one screen with clear labels:

In `PartnerDetail.tsx` settings:
- **Partner rate ($/delivered)** — `default_payout_rate_usd`
- **Manager rate ($/delivered)** — `referral_rate_usd` (what the upline manager earns per delivered message from this partner's numbers)
- **Manager** — `referrer_partner_id` dropdown

Both numeric inputs use `step="0.0001"` and render with `fmtRate`.

No DB schema change required for this part — fields already exist.

---

## Part D — Three views, three PDFs

The run is computed per partner exactly like today. Presentation gets three modes via a `mode` param on `payout-report-pdf`:

### 1. Internal admin PDF (`mode=internal`, default)
What we have today, with new labels. Includes client rate, billed, margin, manager-payable line.

### 2. Partner PDF (`mode=partner`)
For the partner themselves. Shows only:
- Partner name, period, payment status, paid date/ref if paid
- Totals: Delivered · Failed · **Partner rate** · **Partner payout due**
- Breakdown: Day · Number · Client · Delivered · Failed · Partner rate · Partner payout
- No client rate, no billed, no margin, no mention of manager

### 3. Manager PDF (`mode=manager`)
One consolidated report for a given manager covering a period. Driven by a new edge function `manager-payout-report-pdf` (or same function with `mode=manager` + `manager_id` param). It:
- Resolves all partners where `partners.referrer_partner_id = manager_id` AND the manager themself
- For each, pulls (or generates a draft of) the payout run for the same period
- Shows:
  - Manager name, period, payment status
  - Top-line: Total payout due to manager = (manager's own delivered × partner rate) + Σ (each downline partner's delivered × manager rate)
  - Section A — "Your own numbers": Day · Number · Client · Delivered · Partner rate · Partner payout (the manager is also a partner)
  - Section B — "Your team": one row per downline partner with Partner name · Delivered · Manager rate · Manager payout. Optional expandable per-day rows.
- No client rate, no billed, no our-margin shown.

UI in `FinanceRunDetail.tsx`:
- Replace the single "Generate PDF" with a dropdown menu: **Internal PDF**, **Partner PDF**, **Manager PDF** (Manager PDF disabled with a tooltip if the partner has no `referrer_partner_id`, since then they are the manager — in that case show **Manager PDF** at the manager's own page).
- Store storage paths separately on `payout_runs`: `internal_pdf_storage_path`, `partner_pdf_storage_path`, `manager_pdf_storage_path` (rename current `pdf_storage_path` → `internal_pdf_storage_path` via migration).

On `PartnerDetail.tsx` (or a new "Manager Reports" section visible only when this partner has downlines), add a date-range picker + **Generate manager PDF** button covering all their downlines + own numbers.

---

## Part E — Clear summary strip

Top of `FinanceRunDetail.tsx` and the partner/manager PDF header:

```text
Period 2026-05-01 → 2026-05-13   ·   Status: PAID
Delivered 12,430   ·   Partner rate $0.0050   ·   Partner payout due $62.15
```

Manager PDF variant adds: `Manager payout due $X.XX (own + N downlines)`.

---

## Part F — Performance

In `FinanceRunDetail.tsx`:
- Memoize per-number rollups
- Batch `run` + `items` + `audit` queries
- Precompute formatted dates in the select mapper
- After PDF generate, only refetch the run row (no full reload)

---

## Files to change

- New migration on `payout_runs`: rename `pdf_storage_path` → `internal_pdf_storage_path`; add `partner_pdf_storage_path`, `manager_pdf_storage_path`
- `supabase/functions/payout-report-pdf/index.ts` — accept `mode: "internal" | "partner"`, add `fmtRate`, relabel
- New `supabase/functions/manager-payout-report-pdf/index.ts` — consolidated manager PDF over a date range
- `supabase/functions/slack-payout-post/index.ts` — point to the partner PDF (not internal) for any partner-shared channel
- `src/pages/admin/FinanceRunDetail.tsx` — labels, summary strip, three PDF buttons, memoization, rate-precedence tooltip
- `src/pages/admin/PartnerDetail.tsx` — clear "Partner rate" + "Manager rate" inputs, Manager Reports section with date range + generate button
- `src/pages/admin/FinancePartnerDetail.tsx`, `Partners.tsx` — `fmtRate` for rate columns, "Referral" → "Manager" copy

## Out of scope

- Auto-emailing PDFs to partners/managers (kept manual download for now per user)
- Changing the rate-precedence SQL (already correct)
- Changing payout math