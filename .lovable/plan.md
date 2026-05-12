
# Partner Payout & Delivery Finance — MVP Plan

Goal: pay partners by *delivered* WhatsApp messages, with per-client billing rates and per-partner payout rates, in a way that is **accurate, auditable, and rebuildable** from raw events.

We already have:
- `whatsapp_message_events` (event_type: sent/delivered/failed/read, with `whatsapp_number_id`, `workspace_id`, timestamps) — **this is our source of truth**.
- `whatsapp_numbers` with `partner_source`, `provided_by`, `assigned_ref` (free-text today).
- `workspaces.delivered_rate_usd` (client billing rate already exists).

We will build on top of these — never replace them.

---

## 1. Product Model

**Partner** — a person/company that owns or sources numbers. Has contact info + default payout rate + payment method notes.

**Number ownership** — every `whatsapp_number` belongs to exactly one partner *at a point in time* (history matters; ownership can transfer).

**Client billing rate** — `$/delivered` per workspace (already exists, will become time-versioned).

**Partner payout rate** — `$/delivered` per partner, optionally overridable per (partner × number) or (partner × workspace).

**Margin** = client rate − partner rate, computed at report time from the rate that was active for each delivered event.

**Payout period / Payout run** — an immutable snapshot of "partner X gets $Y for window [from, to]" with line items per number/day. Has a status: `draft → approved → paid`.

---

## 2. Data Model

### New tables

```text
partners
  id, name, contact_email, contact_phone, payment_notes,
  default_payout_rate_usd, currency, status (active/inactive),
  created_at, updated_at, created_by

partner_rates                       (time-versioned overrides)
  id, partner_id, scope ('default'|'number'|'workspace'),
  whatsapp_number_id NULL, workspace_id NULL,
  rate_usd, effective_from timestamptz, effective_to timestamptz NULL,
  created_at, created_by

workspace_billing_rates             (time-versioned client rate)
  id, workspace_id, rate_usd,
  effective_from, effective_to NULL, created_at, created_by

number_ownership                    (time-versioned partner→number)
  id, whatsapp_number_id, partner_id,
  effective_from, effective_to NULL, created_at, created_by

payout_runs
  id, partner_id, period_from date, period_to date,
  status ('draft'|'approved'|'paid'|'void'),
  totals_delivered int, totals_failed int, totals_sent int,
  total_payout_usd numeric, total_billed_usd numeric, margin_usd numeric,
  generated_at, generated_by, approved_at, approved_by,
  paid_at, paid_by, paid_reference text, paid_amount_usd numeric,
  pdf_storage_path text, csv_storage_path text,
  source_data_hash text,             -- fingerprint of raw events used
  notes text

payout_line_items                   (immutable once run is approved)
  id, payout_run_id, day date,
  whatsapp_number_id, workspace_id,
  delivered int, failed int, sent int,
  partner_rate_usd numeric, client_rate_usd numeric,
  payout_usd numeric, billed_usd numeric, margin_usd numeric

payout_run_audit
  id, payout_run_id, action, actor, at, before jsonb, after jsonb
```

### Why time-versioned
A delivered event on May 3 must be paid at the rate / ownership active on May 3, even if we change rates today. Every rate/ownership row carries `effective_from`/`effective_to`; lookups use `event.received_at BETWEEN from AND coalesce(to, 'infinity')`.

### Migration of existing data
- `workspaces.delivered_rate_usd` → seed first row in `workspace_billing_rates` with `effective_from = workspace.created_at`. Keep the column as a "current rate" cache, updated by a trigger.
- Existing `whatsapp_numbers.partner_source` (free text) → create `partners` from distinct values, seed `number_ownership` with `effective_from = number.created_at`. Keep `partner_source` for backward compat.

---

## 3. Reporting Model

**Billable event = `whatsapp_message_events.event_type = 'delivered'`**, deduplicated by `(provider_message_id, event_type)` (we already have a unique-ish stream; we will add a unique index to harden it).

For a window `[from, to)` and partner P:

```text
1. Find every number N owned by P at any time during window
   (number_ownership intervals overlapping window).
2. For each delivered event E on N where E.received_at ∈ window
   AND E.received_at ∈ ownership(N, P):
     partner_rate = rate active for (P, N or workspace or default) at E.received_at
     client_rate  = workspace_billing_rate active for E.workspace_id at E.received_at
     payout += partner_rate
     billed += client_rate
3. Group line items by (day, whatsapp_number_id, workspace_id, rates).
```

Failed and sent counts are reported **for visibility only** — not billed. Read events are ignored.

Source of truth ranking:
1. `whatsapp_message_events` (raw provider events) — primary.
2. `campaign_recipients` (only as a sanity cross-check, not for payout math).
3. `messages` — never used for billing.

---

## 4. Accuracy & Safety Design

This is the core of the plan.

### Principles
- **Raw events are immutable**. We never mutate `whatsapp_message_events`.
- **Reports are derived**. A `draft` payout run can always be regenerated from raw. An `approved`/`paid` run is **frozen** (line items locked) but can be re-derived into a new "shadow run" for verification.
- **Time-versioned everything**. Rate/ownership history means yesterday's payout stays correct forever.

### Safeguards

| Risk | Safeguard |
|---|---|
| Rate change applied retroactively | All rate tables are append-only with `effective_from/to`. UI never lets you "edit" — only "end current and start new". |
| Number reassigned to another partner | `number_ownership` interval split. Old payouts unaffected; future events go to new owner. |
| Delayed delivery webhooks | Payout runs use `received_at`, not `created_at`. We add a configurable "settlement lag" (default 48h) — runs for period ending today are gently warned "events still arriving". |
| Duplicated events | Unique index on `(provider_message_id, event_type, whatsapp_number_id)`; ingestion uses `ON CONFLICT DO NOTHING`. Recompute is idempotent. |
| Missing events | Each run stores `source_data_hash` (count + sum of event ids in window). A nightly verifier recomputes the hash for non-paid runs and flags drift. For paid runs, drift creates a "discrepancy ticket" but does not mutate the run. |
| Cron / worker partial failure | Generation is a single transaction: insert run + all line items, or rollback. No partial runs. |
| Rebuild after fix | "Regenerate" button on `draft` runs replaces line items atomically. For `approved`/`paid`, "Generate shadow run" creates a new run flagged `notes = 'verification of run #X'` for side-by-side compare. |
| Auditability | Every status change → `payout_run_audit` row with before/after JSON and actor. PDF embeds `run_id`, `generated_at`, `source_data_hash`, period, and rate snapshot. |

### "How do we know a report is correct?"
- Open run → see `source_data_hash` + raw event count.
- Click "Verify against raw" → recomputes from events live and shows diff (or 0).
- Cross-check: sum of payout line items must equal `payout_runs.total_payout_usd` (DB constraint via trigger).

### "What if something breaks?"
- Draft run: click Regenerate.
- Approved/paid run: generate a shadow run, compare, then either (a) accept the discrepancy and add a manual adjustment line item to the *next* run, or (b) void the run and create a corrected one (audit trail preserved).

---

## 5. Recovery / Backfill

- **Recompute function**: a single `recompute_payout_run(run_id)` SQL function (security definer) that wipes draft line items and rebuilds from raw events using stored period + partner_id. Forbidden on non-draft runs.
- **Backfill missing periods**: admin tool "Generate runs for partner X from date A to date B in N-day chunks" — creates draft runs only.
- **Discrepancy detection**: nightly cron recomputes hash for the last 90d of non-paid runs; mismatches surface in admin UI as a red badge.
- **Snapshots + raw**: we keep BOTH — frozen line items (for legal/payout truth) AND raw events (for verification). PDF + CSV are stored in Supabase Storage at generation; regenerating the PDF doesn't touch line items.
- **Approved/paid protection**: DB trigger blocks `UPDATE`/`DELETE` on `payout_line_items` when parent run.status ∈ ('approved','paid'). Same for the run's monetary totals.

---

## 6. UI / UX

All under `/admin/finance/`.

```text
/admin/finance/partners
  Table: partner | active numbers | last 30d delivered | last 30d payout | unpaid balance
  + "New partner" button

/admin/finance/partners/:id
  Header: name, default rate, currency, contact
  Tabs:
    - Numbers      (assigned numbers with ownership history)
    - Rate history (default + overrides timeline)
    - Payout runs  (table of all runs with status badges)
    - Generate run (period picker → preview totals → create draft)

/admin/finance/runs/:id
  Top: status, period, totals (delivered, failed, payout, billed, margin)
  Action bar: [Regenerate] (draft only) [Verify vs raw] [Approve] [Mark as paid] [Download PDF] [Download CSV] [Void]
  Line items table: day | number | client | delivered | failed | partner rate | client rate | payout | billed
  Audit log at bottom

/admin/finance/clients
  Per-workspace billing rate management with history view

/admin/finance/discrepancies
  Runs flagged by nightly verifier
```

UX rules:
- Approve = freezes line items (irreversible without Void).
- Mark as paid = requires reference (txn id / note) + amount; can differ from `total_payout_usd` (delta stored as `paid_amount_usd` for partial payments).
- Discrepancy banner appears on any run where live recompute ≠ stored totals.

---

## 7. Report Output (PDF + CSV)

**PDF** (generated by edge function `payout-report-pdf` using Deno + a PDF lib):
1. Header: Iskra logo, partner name, period, run id, generated_at.
2. Summary box: total delivered, total payout, currency, payment status.
3. Per-number breakdown: number | client | delivered | failed | rate | payout.
4. Per-day breakdown (collapsible / second page).
5. Verification footer: `source_data_hash`, raw event count, "rates as of <generated_at>".
6. Payment terms / contact.

**CSV** generated alongside (one row per line item) — same data, no formatting, for partner spreadsheets.

Both stored in Supabase Storage bucket `payout-reports/{partner_id}/{run_id}.pdf|.csv` with signed-URL download. Regenerating PDF is allowed any time; regenerating the **numbers** is not (post-approval).

---

## 8. MVP Scope

**P0 — must have**
- `partners`, `number_ownership`, `workspace_billing_rates`, `partner_rates`, `payout_runs`, `payout_line_items`, `payout_run_audit`.
- Migration from existing `partner_source` + `delivered_rate_usd`.
- Generate draft run from period + partner (SQL function over raw events).
- Approve / Mark as paid flow with audit log + DB freeze trigger.
- PDF + CSV generation via edge function, stored in Storage.
- Admin UI: partners list, partner detail, run detail with regenerate/approve/paid.
- "Verify vs raw" button.

**P1 — useful next**
- Per-number / per-workspace partner rate overrides UI.
- Nightly discrepancy verifier + `/admin/finance/discrepancies`.
- Backfill tool for historical periods.
- Per-client billing rate history UI.
- Partial payment handling + outstanding balance per partner.

**P2 — later finance intelligence**
- Margin dashboard (client rate − partner rate trends).
- Forecasting (run rate × historical delivery %).
- Partner self-serve portal (read-only PDF download with magic link).
- Multi-currency + FX snapshot at run time.
- Stripe/Wise payout integration.
- Tax/VAT fields on partner records.

---

## 9. Risks & Edge Cases

- **Rate edits mid-period** → forbidden as in-place edit; must "end + start new", and partial-period runs handle the boundary correctly via per-event lookup.
- **Number transferred mid-period** → ownership interval split; events before/after credited to correct partner. A single run may span an ownership change if you select a wide window — line items are split by day × ownership.
- **Multiple clients on one partner** → already handled, line items group by `(number, workspace)`.
- **Multiple numbers per partner** → native to the model.
- **Retroactive corrections** → never edit paid runs; create an "adjustment" line item on the next draft run (manual entry with reason; logged in audit).
- **Manual overrides** → allowed only on `draft` runs as adjustment line items with `whatsapp_number_id = NULL` and a required `notes` field; surfaced separately in PDF.
- **Late webhook bursts** → settlement-lag warning + nightly verifier will catch.
- **Number with no partner assigned** → events excluded from any payout run; flagged in `/admin/finance/discrepancies` as "unassigned delivered events".
- **Partner deleted** → soft delete only (`status='inactive'`); historical runs untouched.
- **Voiding a paid run** → requires admin + reason; creates negative-mirror audit entry; PDF re-stamped "VOID".

---

### Why this is safe
1. Raw events are immutable + deduplicated.
2. Every rate/ownership decision is timestamped — history is queryable.
3. Draft runs are recomputable; approved/paid runs are frozen but verifiable.
4. Every monetary state change is in `payout_run_audit`.
5. PDFs/CSVs are artifacts on top of frozen line items, regenerable.
6. A discrepancy never silently changes money — it raises a flag.

This gives operations a fast workflow (pick partner → pick week → generate → review → approve → pay → send PDF) while preserving the ability to forensically rebuild any number months later.
