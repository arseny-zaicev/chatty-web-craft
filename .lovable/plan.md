## Three fixes for the partner workflow

### 1. Real earnings everywhere (top strip + BM table + partners list)

Today the Partner page shows "Open payout" and "Paid this month" but never the actual earned $ (delivered × rate). That's the "странная статистика" you're seeing.

- Extend `fetchPartnerMetrics` (and per-BM aggregation in `PartnerDetail`) to compute earnings live by joining `number_live_stats` with `number_ownership.rate_usd` per-number, then summing per partner / per BM. Same math as `partner_earnings_breakdown`, just exposed in the live cards.
- Top strip on `PartnerDetail`: add **Earned today · Earned 7d · Earned all-time** stat cards (green accent). Keep Open payout / Paid this month.
- BM table row: add **Earned today / 7d / all** columns next to the Delivered/Sent columns.
- `Partners.tsx` list: add **Earned today** and **Earned all-time** columns.

### 2. Trim the noisy top stats

Right now the strip has 15 cards. Keep only what you actually act on:

Keep: Total BMs (with split Ready / Disabled inline), Total numbers, Restricted #, Blocked #, Sent today, Delivered today, Errors today (= failed_today), Sent 7d, Delivered 7d, Sent all-time, Delivered all-time, Earned today, Earned 7d, Earned all-time, Open payout, Paid this month.

Drop standalone cards for: Warming up, Verifying (still visible in the BM table column).

### 3. Number ownership knows the BM too

`whatsapp_numbers.business_manager_id` already exists; the UI just doesn't expose it. Add it here so the page becomes a 3-column truth: Number → Partner → BM.

**a) Global `/admin/numbers` page (`NumberOwnership.tsx`)**
- Add **BM** column in both Unassigned and Assigned tabs.
- Inline `<Select>` per row to pick an existing BM **or** "+ Create new BM" (opens a tiny inline dialog: name, Meta BM ID, status). Newly created BM auto-inherits the row's workspace; if the number's owner partner is known we also auto-create the `bm_partner_assignments` row at the partner's default rate so the BM shows up under that partner immediately.
- Bulk-assign dialog: add an optional **BM** picker (existing BMs of the chosen partner, or "+ Create new BM"). When set, after `set_number_ownership` we also `UPDATE whatsapp_numbers.business_manager_id` for each picked number.
- Summary card on top: `N BMs · M numbers · K unassigned` (so you see at a glance how many BMs are in the fleet).

**b) Per-partner `NumberOwnershipPanel` (inside Partner page)**
- Same new **BM** column with inline change / create, scoped to BMs linked to this partner (plus "+ Create" which also links it to this partner).
- Add a small grouping header above the table: per-BM count of numbers (`ISKRA-BM-04 · 7 numbers`, etc.), with a click-to-filter.
- "Assign numbers" dialog: BM dropdown (partner's BMs + Create new).

**c) Per-partner Business Managers tab**
- Each BM row gets a "Manage numbers" button (already exists as `AddNumbersToBmButton`) - upgrade it to a side panel showing **current numbers** of that BM with checkbox to remove + a multi-select "Add" pool of numbers from any BM in the workspace (with confirmation when reassigning). This is the "удобная панель закрепления номеров за этим БМ".

## Files touched

- `src/lib/metrics.ts` — add earnings to `fetchPartnerMetrics` return type and computation.
- `src/pages/admin/PartnerDetail.tsx` — trim top strip, add Earned cards, add Earned columns to BM table.
- `src/pages/admin/Partners.tsx` — Earned columns in list.
- `src/pages/admin/NumberOwnership.tsx` — BM column + inline create/select, bulk-assign BM, top counters.
- `src/components/admin/NumberOwnershipPanel.tsx` — BM column + inline create/select scoped to partner.
- `src/components/admin/BmNumbersPanel.tsx` (new) — side panel for "Manage numbers" of a BM, plugged into the BMs tab.
- No schema migration needed; everything already exists in the DB.

## Out of scope (not changed)

- Payout calculation / finance runs.
- Webhook health, fleet templates.
- Pipeline routing (just shipped).
