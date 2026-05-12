# Partners Control Module — Plan

## 0. Reuse audit (what already exists, do NOT rebuild)

| Need                                | Already in DB / code                                                       | Status |
|-------------------------------------|----------------------------------------------------------------------------|--------|
| Partner directory                   | `partners` table + `/admin/finance/partners` + detail page                 | reuse  |
| Per-event partner rate (time-aware) | `partner_rates(scope: default/workspace/number, effective_from/to)`        | reuse  |
| Number ↔ partner (time-aware)       | `number_ownership`                                                         | reuse  |
| Payout runs + audit + line items    | `payout_runs`, `payout_line_items`, `payout_run_audit` + RPCs              | reuse  |
| PDF + CSV generation                | `supabase/functions/payout-report-pdf`                                     | reuse  |
| Business Managers + warm-up state   | `business_managers`, `business_manager_warmup_events`                      | reuse  |
| Numbers ↔ BM                        | `whatsapp_numbers.business_manager_id` FK                                  | reuse  |
| Slack helper + finance channel      | `_shared/slack.ts` + `SLACK_OPS_FINANCE_CHANNEL_ID`                        | reuse  |

What is missing and must be added:
- Two parties per BM/number: **provider** + **referral**, each with its own share rate
- Explicit Partner ↔ BM relationship (not only via numbers)
- Per-party cadence (weekly / monthly) and auto-generation
- Auto Slack posting of generated reports
- Role-aware report rendering (provider sees only own share; referral sees managed stats + own share; admin sees both)
- A single "Partners" hub page that surfaces operational + financial state together

---

## 1. Product structure

Top-level admin section becomes **Partners** (renamed `/admin/partners`, old `/admin/finance/partners` redirects). Business Managers stay as a separate page but every BM also surfaces inside a Partner's detail.

Hierarchy:

```text
Partner
 ├─ kind: provider | referral | both
 ├─ assignments: BM ↔ partner (role + rate)
 ├─ derived: linked numbers (via BM → numbers, plus legacy number_ownership)
 ├─ cadence: weekly | monthly  (per partner)
 └─ payout runs (already exist; one run per partner per period)
```

Concretely:
- A **Provider** owns the WhatsApp accounts; numbers are physically theirs.
- A **Referral / controller** introduced or operates the provider for us; gets a cut of the same delivered events.
- A BM links to 0..N partners with explicit `role`. The same person can be both for different BMs.
- Numbers inherit their party set from their BM (single source of truth). `number_ownership` is preserved for back-compat and historic accuracy but new operational truth lives at BM level.

---

## 2. UI / UX

Routes:

```text
/admin/partners                      Partners list  (replaces /admin/finance/partners)
/admin/partners/:id                  Partner detail (replaces /admin/finance/partners/:id)
/admin/finance/runs/:id              Run detail     (existing, kept)
/admin/business-managers             BM registry    (existing, kept)
/admin/business-managers/:id         BM detail      (existing, kept)
```

### 2.1 Partners list

- Search + filter by kind (provider / referral / both) and status
- Columns: Name · Kind · # BMs · # Numbers · Active warm-ups · Unpaid (USD) · Cadence · Next report
- Row click → partner detail
- "New partner" dialog (existing) extended with `kind` and `cadence`

### 2.2 Partner detail (tabs)

```text
[ Overview ] [ Business Managers ] [ Numbers ] [ Finance & Reports ] [ Payment History ] [ Settings ]
```

**Overview** — health card grid:
- Active BMs / total BMs · Active numbers / total · Numbers in warm-up · Numbers restricted/blocked
- Last 30d delivered + payout owed · Unpaid total · Next scheduled report

**Business Managers** — table of BMs linked to this partner:
- BM name · Meta BM ID (`external_id`) · Ads running (boolean badge) · Warm-up active · Warm-up start · Planned end · Actual end · Linked numbers (count + status breakdown) · Workspace usage · Health
- Action: "Link BM" (assign existing BM with role + rate) / "Unlink" / "Edit role/rate"

**Numbers** (read-only summary, NOT a registry duplicate):
- Aggregated rows: BM → numbers count + status breakdown + last delivered. No per-row mgmt UI here. Click-through to existing `/admin/business-managers/:id`.

**Finance & Reports**:
- Existing "Generate run" + "Runs" lists, kept
- New: "Cadence" inline editor (weekly / monthly / off)
- New: "Latest report" panel with PDF download + Slack-posted indicator
- New: "Force-run now" button (manual trigger of the same auto-generation pipeline)

**Payment History**:
- Table from `payout_runs` filtered to status in (`approved`, `paid`, `void`)
- Columns: Period · Amount · Status · Paid at · Reference · Action ("Mark paid" / "Re-open")

**Settings**:
- Kind toggle, cadence, default split rate, contact info, payment notes (existing)

### 2.3 BM card visibility (consistent everywhere a BM is shown inside Partners)

For each BM row:
- BM name + Meta BM ID
- Ads running badge (computed: any linked number with sent traffic in last 24h OR explicit flag)
- Warm-up active badge (computed: BM `status='warming'`)
- Warm-up start (`warmup_started_at`), planned end (`warmup_target_date`), actual end (computed: first time `status` left `warming`, stored in new column `warmup_completed_at`)
- Linked numbers summary (`{total, active, warming, restricted, blocked}`)
- Linked workspaces (distinct workspaces of those numbers)
- Health summary (`health_score` + last warmup action timestamp)

---

## 3. Payout model

### 3.1 Concept

Per delivered event we compute total internal cost = client billing rate. That cost is distributed across **assigned parties** for the BM that owned the number at the moment of the event:

```text
delivered_event(number, t)
  → BM = number.business_manager_id at t
  → assignments = bm_partner_assignments active at t for BM
  → for each assignment:
        line_item.payout_usd = delivered * assignment.rate_usd
        line_item.role       = assignment.role
        line_item.partner_id = assignment.partner_id
```

Sum of assignment rates does NOT have to equal the client rate; margin is whatever is left.

Examples:
- provider 0.005 + referral 0.005, client 0.015 → margin 0.005 per delivered
- provider 0.0075 + referral 0.0025, client 0.012 → margin 0.002

### 3.2 Cadence

- Per-partner: `cadence = weekly | monthly | off`, plus `cadence_anchor` (date for monthly = day-of-month, for weekly = ISO weekday)
- Defaults v1: weekly = Monday 09:00 Asia/Dubai, monthly = 1st 09:00 Asia/Dubai
- Generation runs hourly via cron; produces a run for any partner whose next due date is ≤ now and whose previous run for that period does not yet exist

### 3.3 Paid / unpaid

- Already supported per `payout_runs.status` (`draft → approved → paid` / `void`)
- Added: surface `unpaid_usd` on partner detail = sum of `total_payout_usd` for runs in (`approved`, `draft`)
- "Mark paid" uses existing `mark_payout_run_paid` RPC

---

## 4. Report generation

### 4.1 Pipeline

```text
cron (hourly)
  └─► partners-cadence-tick  (new edge fn)
        └─ for each partner due:
             1. call generate_payout_run RPC                      → run_id (draft)
             2. POST payout-report-pdf  { run_id, role: kind }    → pdf in storage
             3. POST slack-finance-post { run_id, role }          → message + file
             4. mark run audit "auto_posted"
```

### 4.2 Role-specific PDF rendering

`payout-report-pdf` extended with optional `role` param:

| Section            | provider PDF | referral PDF | admin PDF |
|--------------------|:------------:|:------------:|:---------:|
| Header + period    | yes          | yes          | yes       |
| Per-BM totals      | own only     | all managed  | all       |
| Per-number daily   | own only     | own + managed| all       |
| Payout (own share) | yes          | yes          | yes       |
| Client billed      | hidden       | hidden       | yes       |
| Margin             | hidden       | hidden       | yes       |

A run is partner-scoped already, so "own only" = the run's partner. For referral runs that span BMs they manage, the referral sees the aggregated managed traffic but the payout column shows only their own share.

### 4.3 Slack posting

New edge fn `slack-payout-post` uploads PDF as a Slack file to `SLACK_OPS_FINANCE_CHANNEL_ID` with a compact summary block:

```
:moneybag: Weekly payout — *Nitish (provider)* — 2026-05-04 → 2026-05-10
Delivered 14,328 · Payout $107.46 · Status DRAFT
[Open run] [PDF]
```

WhatsApp delivery is manual in v1 (admin forwards the file).

---

## 5. Data model (only new objects)

All migrations are additive. No data loss, no breaking changes to existing pages.

### 5.1 New columns on `partners`

```sql
alter table partners
  add column kind text not null default 'provider'
    check (kind in ('provider','referral','both')),
  add column cadence text not null default 'weekly'
    check (cadence in ('off','weekly','monthly')),
  add column cadence_anchor int,         -- 1..7 for weekly (ISO), 1..28 for monthly
  add column timezone text not null default 'Asia/Dubai',
  add column auto_post_slack boolean not null default true,
  add column last_run_period_to date;    -- watermark for cadence ticker
```

### 5.2 New table `bm_partner_assignments`

```sql
create table bm_partner_assignments (
  id uuid primary key default gen_random_uuid(),
  business_manager_id uuid not null references business_managers(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete restrict,
  role text not null check (role in ('provider','referral')),
  rate_usd numeric not null,             -- per delivered event, this party's share
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (business_manager_id, partner_id, role, effective_from)
);
create index on bm_partner_assignments (business_manager_id, role, effective_from desc);
create index on bm_partner_assignments (partner_id, effective_from desc);
-- Admin-only RLS using is_admin(auth.uid())
```

### 5.3 New columns on `business_managers`

```sql
alter table business_managers
  add column warmup_completed_at timestamptz,    -- actual end (auto-stamped via trigger when status leaves 'warming')
  add column ads_running boolean not null default false,
  add column meta_bm_id text;                    -- explicit Meta BM ID; falls back to external_id
```

### 5.4 New columns on `payout_runs` and `payout_line_items`

```sql
alter table payout_runs
  add column role text check (role in ('provider','referral')),  -- nullable for legacy runs
  add column cadence text check (cadence in ('manual','weekly','monthly')) default 'manual',
  add column auto_generated boolean not null default false,
  add column slack_message_ts text,
  add column slack_channel_id text;

alter table payout_line_items
  add column role text check (role in ('provider','referral'));  -- nullable for legacy
```

### 5.5 New helper RPC

```sql
-- Replaces partner_rate_at lookup for the new model.
-- Returns the active assignment rate for a given BM/partner/role at time t.
create function bm_assignment_rate_at(
  _bm uuid, _partner uuid, _role text, _at timestamptz
) returns numeric ...;
```

`recompute_payout_run` is extended (not rewritten): if `payout_runs.role` is set, it joins via `bm_partner_assignments` instead of `number_ownership`. If `role` is null, behaviour is unchanged (back-compat).

### 5.6 Cron

Single hourly cron via `pg_cron` calling `partners-cadence-tick` edge fn (uses existing `pg_cron`+`pg_net`, see other crons in project).

---

## 6. Visibility / RLS

v1 keeps all admin-only access (existing RLS). The role-specific PDF content is enforced inside the edge fn render code, NOT via DB row filters, because partners do not yet have user accounts. When a future "partner portal" lands, we add a `partner_users(user_id, partner_id)` table and SELECT policies on `payout_runs` / `payout_line_items` that allow `partner_users.user_id = auth.uid()` AND `role = own role`.

This is documented as a P2 step; v1 only renders the right PDF.

---

## 7. Constraints honoured

- Numbers registry NOT duplicated. The Numbers tab in Partners shows aggregated counts per BM, with click-through to existing BM detail page.
- Existing `/admin/business-managers*` pages stay as-is; Partners just embeds the same data in a partner-centric view.
- Existing payout pipeline (`generate_payout_run`, `recompute_payout_run`, PDF fn) is extended additively — no breaking schema changes.
- Existing routes redirected, not removed.

---

## 8. P0 / P1 / P2 split

### P0 (this PR — implement after plan approval)

1. Migration: new columns on `partners`, `business_managers`, `payout_runs`, `payout_line_items`; new `bm_partner_assignments` table + RLS; trigger to auto-stamp `warmup_completed_at`; extension of `recompute_payout_run` to support assignment-based runs.
2. Routes: `/admin/partners` (list) and `/admin/partners/:id` (detail with all tabs above). Old `/admin/finance/partners*` routes redirect.
3. BM-link UI inside partner detail: list, link, unlink, edit role + rate.
4. Linked numbers summary (read-only aggregation, no edit).
5. Warm-up / ads-running visibility on each BM card.
6. Generate-run + Runs list reused as-is; generation accepts optional `role` to scope to one party.
7. Mark paid / unpaid (existing RPCs surfaced in Payment History tab).
8. Edge fn `partners-cadence-tick` + hourly cron, calling `payout-report-pdf` and `slack-payout-post`.
9. Edge fn `slack-payout-post` (uses `SLACK_OPS_FINANCE_CHANNEL_ID`).
10. PDF render extended with `role` parameter (provider | referral | admin) for column hiding.
11. Admin nav updated: `Partners` replaces `Finance · Partners`.

### P1 (next)

- Per-partner timezone-aware "Next report" preview on overview
- Manual report-period override UI (custom from/to inside cadence panel)
- Force-resend Slack post button
- Bulk import of BM ↔ partner assignments via CSV
- WhatsApp send button (still manual but pre-fills message + file link)

### P2

- Partner portal users (`partner_users`) + RLS for self-service PDF download
- Auto-detect ads_running from Meta API instead of manual flag
- Margin alerts (warn admin when split exceeds client rate)
- Multi-currency

---

## 9. Files that will change in P0

New:
- migration (one)
- `src/pages/admin/Partners.tsx`
- `src/pages/admin/PartnerDetail.tsx`
- `src/components/admin/partners/BMLinksTable.tsx`
- `src/components/admin/partners/LinkedNumbersSummary.tsx`
- `src/components/admin/partners/PaymentHistory.tsx`
- `src/components/admin/partners/CadencePanel.tsx`
- `supabase/functions/partners-cadence-tick/index.ts`
- `supabase/functions/slack-payout-post/index.ts`

Edited:
- `supabase/functions/payout-report-pdf/index.ts` (add `role` param)
- `src/App.tsx` (routes + redirects)
- `src/pages/AdminPanel.tsx` (nav label / link)
- `src/pages/admin/FinancePartners.tsx` → thin redirect to `/admin/partners`
- `src/pages/admin/FinancePartnerDetail.tsx` → redirect

Cron is created via `supabase--insert` (project-specific URL/key, not a migration), as per project convention.
