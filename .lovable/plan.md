# Campaigns view — daily breakdown + accurate totals

## Problems in current view (`/ws/:slug/campaigns`)

Looking at the screenshot of the Goswyft `co03_main` campaign:

1. **Header says `0/1000`** (sum of `total_recipients` across 2 sibling number campaigns) but **the inner `Total` card shows `500`**. This is because `fetchRecipients` is hard-capped at `limit(500)` per campaign and only counts what was returned. Numbers don't match — looks broken.
2. **No daily breakdown.** Campaigns run across multiple days (`scheduled_dates` + `respect_recipient_tz` windowing), but the UI just shows one cumulative `Sent / Pending / Failed`. The user wants to see, per day, how many are scheduled / sent, and at what time the day starts.
3. **Top-of-card metric is just lifetime total.** They want to see *today's* scheduled volume + start time right in the header (matches what we already send to Slack).
4. The flat recipient list (200 rows) is noisy and not useful for clients — they want a daily breakdown instead, with the per-recipient list pushed below or behind a toggle.

## What to build (UI-only — no backend changes)

### A. Header row (collapsed group)

Replace the single `Sent X/Y` chip with:

- **Total** — sum of `total_recipients` across siblings (already correct from `groupCampaigns`).
- **Sent** — sum of `sent_count`.
- **Today** — `today_recipients_count` summed across siblings + first start time formatted in the recipient-country timezone (`recipient_country` → `COUNTRY_TZ`, same map already used in `_shared/slackBlocks.ts`). If `first_scheduled_at` is in the future today: `200 today @ 09:00`. If today is 0 but a future date is scheduled: `Starts May 14`. If nothing scheduled: `Not scheduled yet`.

Status badge stays on the right.

### B. Expanded detail — replace the current 5 KPI cards + recipients table

New structure:

1. **Summary strip** (5 cards, computed from `campaigns` rows, not from a capped recipient query):
   - Total (Σ total_recipients)
   - Sent (Σ sent_count)
   - Failed (Σ failed_count)
   - Pending (Total − Sent − Failed)
   - Today (Σ today_recipients_count) with subtitle "starts HH:MM TZ"

2. **Per-day breakdown table** — the new centerpiece:
   - Query `campaign_recipients` grouped by date (`scheduled_at::date` in recipient TZ), aggregated server-side via a small RPC OR via a single `select scheduled_at, status` over all sibling campaigns followed by client-side bucketing. Given typical volumes (≤ a few thousand rows per group) we'll do client-side bucketing but use `count: 'exact', head: false` and select only `scheduled_at, status, sent_at` — no row cap, paginate in 1000-row chunks until exhausted.
   - Columns: **Date** · **Window start** (first `scheduled_at` of the day, in recipient TZ) · **Scheduled** · **Sent** · **Failed** · **Reply rate** (if we have reply data — leave as `—` for now since the panel below already covers it).
   - Highlight today's row.
   - Rows sorted ascending by date; collapse past completed days behind a "Show N earlier days" toggle so only today + future + last completed day are visible by default.

3. **Per-number breakdown** (managers only) — keep as-is, it's already correct.

4. **Recipients table** — hide behind a `Show recipients (N)` disclosure. When opened, fetch in chunks (no 500 cap) and render the same compact table as today.

5. **Intelligence report** (`CampaignReportPanel`) — unchanged, stays at the bottom.

### C. Data fetching changes

- Drop the `limit(500)` cap. New helper `fetchRecipientsAll(campaignIds: string[])` that pages with `range(from, from+999)` until fewer than 1000 rows are returned. Selects only `id, status, scheduled_at, sent_at` for the daily aggregation; the full recipients list (with phone/error) is fetched lazily when the user opens the disclosure.
- Day bucketing uses `Intl.DateTimeFormat('en-CA', { timeZone })` with the country's TZ (same `COUNTRY_TZ` map — extract it from `_shared/slackBlocks.ts` into a new `src/lib/timezones.ts` so both edge functions and the frontend can import the constant). Fallback: UTC.

## Files to touch

- `src/pages/workspace/WorkspaceCampaigns.tsx` — rewrite `CampaignDetail` body and header chips, add `DailyBreakdown` sub-component and `RecipientsDisclosure` sub-component.
- `src/lib/campaigns.ts` — extend `CampaignGroup` with `today: number`, `firstScheduledAt: string | null`, `recipientCountry: string | null`; populate from the new `campaigns` columns inside `groupCampaigns`.
- `src/lib/launchData.ts` — make sure `fetchCampaignSummaries` selects the new columns (`today_recipients_count`, `first_scheduled_at`, `recipient_country`).
- New `src/lib/timezones.ts` — exports `COUNTRY_TZ` and a `formatInTz(date, tz, opts)` helper. Also imported by `supabase/functions/_shared/slackBlocks.ts` (deno-compatible plain TS, no React deps) so the map stays single-source.

## Out of scope (not changing now)

- No DB migration — we already have `today_recipients_count`, `first_scheduled_at`, `recipient_country` from the previous loop.
- No change to how `today_recipients_count` is computed (campaigns/index.ts is correct).
- No change to Slack notifications.
- No change to `CampaignReportPanel` AI insights.

## Acceptance

- Goswyft `co03_main` row shows `1000` total in both the header and the expanded `Total` card (no more `500` mismatch).
- Header chip shows `200 today @ 09:00 (US/Eastern)` style summary (or `Not scheduled yet`).
- Expanding the campaign shows a Day-by-Day table: `May 12 · 09:00 · 200 scheduled · 0 sent`, `May 13 · 09:00 · 300 scheduled`, etc.
- Recipients flat list is hidden by default behind a `Show recipients` toggle and is no longer capped at 500.
