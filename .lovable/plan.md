## Goal

Add a visible "health check" loop on top of the existing `numbers-health-sync` so you (and Slack) can see at a glance: how many numbers were checked, how many are healthy, which ones have problems — without opening each row.

## What already exists (don't rebuild)

- `numbers-health-sync` edge function pulls Gupshup status / messaging limit / quality / display name and updates `whatsapp_numbers`. Cron runs it every 15 min.
- DB trigger already posts to Slack when `status` or `messaging_limit` changes.
- Email ingestion (`gupshup-mail-poll`) handles RESTRICTED notices for newer accounts.

So the engine is there — what's missing is **visibility, on-demand runs, and a digest**.

## Plan

### 1. "Check all numbers now" button in Fleet Registry
Top-right of `/admin/fleet`, next to the search:
- Button "Run health check" → calls `numbers-health-sync` with no body (= sweep all).
- While running: spinner + disabled.
- On done: toast with summary + a result strip pinned above the table:
  ```
  Checked 42 · 36 healthy · 4 restricted · 1 banned · 1 unreachable   [Re-run] [Dismiss]
  ```
- Rows that changed during this run get a subtle pulse highlight for ~5s.

### 2. Per-row "Re-check" action
In the row's actions menu add "Re-check now" → calls the same function with `{ number_id }` (already supported). Updates that single row in place.

### 3. Health summary digest (Slack, every N hours)
New tiny edge function `numbers-health-digest`:
- Reads `whatsapp_numbers` (active only) + groups by `status`, `quality_rating`, `messaging_limit`.
- Posts one Slack message to `delivery-leads` like:
  ```
  📋 Fleet health digest (last 6h)
  • 38 active · 3 restricted · 1 banned · 0 unreachable
  • Quality: 35 GREEN · 5 YELLOW · 2 RED
  • Tier: 12 TIER_1K · 18 TIER_10K · 8 TIER_100K
  • Changed since last digest: 2 (BigZ Hyprmrkt → restricted, Cleon → quality YELLOW)
  ```
- Only posts if there's something worth saying (changes OR a number in non-healthy state). Silent otherwise to avoid noise.
- Cron every 6h (configurable). Uses a small `system_state` row to remember the last digest snapshot for the diff.

### 4. Surface last sync info in the row
Each Fleet row already has a status badge — add a tiny muted line under it:
- `synced 4m ago` (green dot) — from `last_health_sync_at`
- `sync failed: <err>` (red dot) — from `last_health_sync_error`
This makes "is the health data fresh?" answerable without clicking.

### 5. Health overview card on Fleet page
Above the table, a thin 4-tile strip (always visible):
```
Active 38   Restricted 3   Banned 1   Unreachable 0
```
Click a tile = filters the table to that subset. Reuses data already loaded — no new query.

## Out of scope (on purpose)

- No auto-quarantine / auto-disable. We surface, you decide. (Status flips already happen via existing logic.)
- No new metric storage / time-series. The digest diffs against the previous snapshot only — keeps it cheap.

## Technical notes

- New file: `supabase/functions/numbers-health-digest/index.ts` + cron entry (every 6h) + `verify_jwt = false`.
- New table `fleet_health_snapshots` (id, captured_at, summary jsonb) — single row updated on each digest run; used for diffing.
- `FleetRegistry.tsx`: add header button, summary strip, per-row re-check action, last-sync sub-line, overview tiles. All client-side, calls `supabase.functions.invoke('numbers-health-sync', ...)`.
- Reuse existing toasts/badges; no new design tokens.

Want me to build all 5, or trim to a subset (e.g. just #1 + #2 + #4 first)?