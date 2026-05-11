## What I found

### 1) Unassigned filter — root cause
Database currently has **9 stock + 1 banned** numbers with `workspace_id IS NULL` (out of 17). The screenshot showing "Unassigned 0" is from **before** the previous fix landed — the `isReadyUnassignedNumber` predicate has already been loosened to `workspace_id IS NULL && !banned/restricted`, so the tile and filter will start counting these 9 once the page reloads.

What's still wrong, though, is **how we communicate it** and the data freshness:
- The tile/filter counts the same 9 numbers but says "can allocate", which is misleading because some of them aren't actually ready (no templates, no webhook, etc.). They're just sitting on the shelf.
- Fleet data is fetched once per session and doesn't auto-refresh after reassign/admin actions in other tabs.

### 2) "Running" campaigns that are actually finished — root cause
Salesforge has 2 campaigns marked `status='running'`:
- recipients: **49 sent + 1 failed = 50 terminal, 0 pending**
- but `campaigns.sent_count` is stale (23 + 24 = 47, not 49) and `status` is still `running`.

In `supabase/functions/campaigns/index.ts` (line ~822), the recount + status flip to `completed` only runs **inside the same tick that processed at least one due recipient**. Once a campaign has no pending recipients, no future tick touches it — so it's stuck at `running` forever. That's why the admin card and the workspace badge still scream "Running".

Separately, the workspace "Active" badge already conflates two ideas:
- *the client account is active* (subscription, has numbers, you can talk to them)
- *a send is happening right now* (a number is actively pushing messages)

The user wants these split.

---

## Plan

### A. Unassigned filter & tile (Fleet Registry)

1. **Keep** the loosened `isReadyUnassignedNumber` (workspace_id null, not restricted/banned). That fixes the empty-list bug.
2. **Rename for clarity:**
   - Tile label stays "Unassigned", hint changes from "can allocate" to **"no client"** so it doesn't promise readiness.
   - Add a small sub-counter inside the tile: `9 · 4 ready to allocate` (computed from the old strict predicate). Clicking "ready to allocate" applies an extra filter pill.
3. **Auto-refresh:** after `reassign`, `remove`, and on tab focus, invalidate `["fleet-registry"]` so the count updates without a manual reload. Also subscribe to `whatsapp_numbers` realtime changes and invalidate on `UPDATE/INSERT/DELETE`.

### B. Campaigns: fix "stuck Running"

**Backend (one-time + ongoing):**
1. **Backfill sweep** — one SQL run that, for every `campaigns` row with `status='running'`:
   - recomputes `sent_count`, `failed_count` from `campaign_recipients`,
   - if there are zero recipients in `pending/scheduled/sending`, sets `status='completed'`.
   This unsticks Salesforge immediately.
2. **Add a reaper to `processCampaignsTick`** — at the end of each tick, regardless of whether recipients were due, scan `campaigns` where `status='running' AND updated_at < now() - interval '5 minutes'`, run the same recount, flip to `completed` when terminal. Cheap query, prevents future drift.
3. **(Optional, defer):** also flip `status='running'` → `completed` when the last selected `scheduled_dates` day is in the past and there are zero pending recipients, even if updated_at is recent.

### C. Campaigns + numbers: separate "active" from "sending now"

Introduce two derived signals (no schema change required, computed in `portfolioMetrics.ts` and `FleetRegistry.tsx`):

| Signal | Meaning | How to compute |
|---|---|---|
| **client.active** | Active client account | `workspaces.is_active = true` (existing) |
| **campaign.sendingNow** | A send is actually flowing | campaign has `status='running'` AND `pending+scheduled+sending recipients > 0` AND at least one recipient sent in the last 15 min |
| **campaign.done** | All recipients terminal | `pending+scheduled+sending = 0` |
| **number.sendingNow** | This specific number is pushing | belongs to a `campaign.sendingNow` AND has its own pending recipients |

**Admin Portfolio card (per workspace):**
- Badge stays green "Active" when the client is active. Yellow "Paused" if `is_active=false`.
- Campaign block:
  - if `sendingNow` → "🚀 Sending now · <name> · X% (sent/total) · Y today"
  - else if `done` and finished today → "✅ Done · <name> · X% sent (Y/total)"
  - else if scheduled future day → "📅 Next: <name> · starts <date>"
  - else → "No campaign scheduled"
- No more "Campaign running" when nothing is being sent.

**Fleet Registry tiles + Status column:**
- "ACTIVE" tile relabel: **"Sending now"** (count of numbers where `number.sendingNow` is true). Today shows `2`; after the reaper runs, Salesforge's two numbers will drop to `0` because their campaigns are done.
- New tile **"Allocated"** (already exists) keeps numbers that have a client but aren't sending.
- Per-row `Status` column: replace single "active" pill with one of `Sending now / Allocated / Warming / Stock / Restricted / Banned / Done (today)`.

### D. Order of execution

1. Backend reaper + one-shot backfill (B) — unsticks Salesforge.
2. Frontend signals + relabels (C) — admin card + Fleet tiles read the new derived state.
3. Fleet UI polish + auto-refresh (A) — clear copy, keeps numbers tile/filter fresh.

### Files I expect to touch
- `supabase/functions/campaigns/index.ts` — add reaper in `processCampaignsTick`.
- one migration / ad-hoc insert SQL — backfill running→completed.
- `src/lib/portfolioMetrics.ts` — add `campaign.sendingNow`, `campaign.done`, expose `delivered_today` per active group.
- `src/pages/AdminPanel.tsx` — relabel badge + campaign block.
- `src/pages/admin/FleetRegistry.tsx` — derived `number.sendingNow`, tile relabel, sub-count, realtime invalidation.

No schema changes required.