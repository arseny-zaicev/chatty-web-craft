# Operator Performance Dashboard

Internal-only dashboard at `/admin/ops/performance` showing ownership, response speed and outcomes for every operator in the team. Same admin guard pattern as `OpsLive` / `FleetAnalytics`.

## 1. Definitions (locked)

| Term | Meaning |
|---|---|
| **Assigned** | `conversations.assigned_user_id = operator` (currently owned). |
| **Active** | Operator has sent at least one human reply in the last 7 days (`messages.sent_by_user_id = operator` with `direction='outbound'`). |
| **Human reply** | `messages.direction='outbound' AND sent_by_user_id IS NOT NULL`. Campaign sends (`sent_by_user_id IS NULL`) are **never** counted. |
| **First human reply time** | `min(human_msg.created_at) - first_inbound.created_at` for that conversation. |
| **Waiting** | Last message in conversation is `inbound` AND no human reply since. |
| **Waiting since** | `created_at` of that last unanswered inbound. |
| **Overdue** | `waiting` AND `waiting_since < now() - 2h` during business hours (09:00-18:00 GST, Mon-Sat). Threshold is a constant in code, easy to tune. |
| **Positive reply** | Conversation moved into a stage whose `stage_type='open'` AND name matches positive regex (same regex the webhook already uses). Counted once per conversation per day. Attributed to current `assigned_user_id`. |
| **Meeting** | Deal currently in a stage whose name matches `/meeting|booked|demo|call\s*scheduled/i`. Attributed to `assigned_user_id` of the linked conversation. |

Automated outbound campaign messages are excluded everywhere by the `sent_by_user_id IS NOT NULL` filter — no schema change needed for that.

## 2. Data model changes

Existing columns we already use as-is: `conversations.assigned_user_id`, `conversations.active_responder_id`, `messages.sent_by_user_id`, `messages.direction`, `messages.created_at`.

New, all on `conversations` (cheap, no history table in v1):

- `assigned_at timestamptz` — set whenever `assigned_user_id` changes (trigger).
- `first_human_reply_at timestamptz` — set once, by trigger on `messages` insert.
- `last_human_reply_at timestamptz` — updated by same trigger on every human outbound.
- `last_inbound_at timestamptz` — updated by trigger on every inbound insert.
- `waiting_since timestamptz` — set to inbound `created_at` when an inbound arrives and there is no later human reply; cleared (set NULL) when a human reply lands.

Backfill all five from existing `messages` in the migration.

Assignment history is **out of scope for v1** (per "keep first version simple"). We can add `conversation_assignments` later if managers ask for "who handled this before".

## 3. Backend: one RPC, one view

Single SQL function `ops_operator_performance(window_start, window_end)` returns one row per workspace member with all per-operator metrics. The dashboard page calls it once and renders both the team strip (sums) and the operator table (rows).

Drilldown reads `conversations` directly with filter `assigned_user_id = :id`, ordered by `waiting_since DESC NULLS LAST`.

Both protected by `is_admin(auth.uid())` — internal tool only.

## 4. UI

Route: `/admin/ops/performance` → `src/pages/admin/OpsPerformance.tsx`. Linked from the existing admin nav next to Ops Live.

### 4.1 Team overview strip (7 tiles)

Assigned chats now • Unread chats now • Waiting for reply • Overdue by SLA • Median first response today • Positive replies today • Meetings today.

### 4.2 Operator table

Columns: Operator · Assigned · Active · Unread · Waiting first reply · Median first response · Median reply time · Overdue · Positive replies (today / 7d) · Meetings · Oldest waiting.

Sortable, default sort: Overdue desc → Oldest waiting desc.

Row click → drilldown drawer.

### 4.3 Drilldown

Operator name, summary tiles (same metrics, scoped), then a table of their assigned conversations:

Workspace · Pipeline · Contact · Last inbound · Last outbound · Waiting since · Status badge (Replied / Waiting / Overdue / Stuck >24h) · link to `/ws/:slug/inbox?conversation=:id`.

### 4.4 Time window control

Today / 7d / 30d toggle (drives `window_start/end` passed to the RPC). "Now" tiles always reflect current state regardless of window.

## 5. Files

- `supabase/migrations/<ts>_operator_performance.sql` — 5 columns, triggers on `messages`, backfill, `ops_operator_performance` SQL function, indexes on `(assigned_user_id, waiting_since)` and `(assigned_user_id, last_human_reply_at)`.
- `src/pages/admin/OpsPerformance.tsx` — page.
- `src/components/ops/OperatorTable.tsx` — table.
- `src/components/ops/OperatorDrilldown.tsx` — side sheet.
- `src/components/ops/TeamOverviewStrip.tsx` — 7 tiles.
- `src/lib/opsPerformance.ts` — typed wrapper around the RPC + drilldown query.
- `src/App.tsx` — register route.
- Admin sidebar: add "Team Performance" link.

## 6. What this unlocks

Before: managers had no way to see who owned what, who was slow, or which chats were rotting. Slack alerts told us a positive reply happened, but not who picked it up or how long the lead waited.

After: one screen shows, for every operator, their current load, their reply speed (median first reply + median follow-up), how many chats are overdue right now, and how many positive replies / meetings they've actually closed. Click an operator → see exactly which conversations are stuck and jump straight into the inbox to handle them. Automated campaign sends are excluded from "operator replied" everywhere, so the numbers are trustworthy.

## 7. Out of scope (v1)

- Per-operator goals / targets.
- Reassignment from this screen (use existing inbox).
- Per-pipeline performance breakdown (can layer later).
- Historical assignment audit trail.
- Email/Slack daily digest of this dashboard.
