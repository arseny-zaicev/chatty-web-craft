
# Multi-Pipeline MVP - Implementation Plan

## Recommended MVP Scope (cut line)

In:
- Pipeline-aware deal creation (correctness fix)
- Pipeline management UI in Settings (create / rename / recolor / set default / delete)
- Pipeline selector on Pipeline page (single pipeline at a time, URL-driven)
- Pipeline filter in Inbox (specific pipeline / Unassigned / All)
- "Move to pipeline" action on a conversation and on a deal
- Backfill of `NULL` `pipeline_id` to the workspace default
- Launch Wizard already sends `pipeline_id`; only add an inline "Create board" link

Out (post-MVP):
- Per-pipeline stage customization UI (stages stay default-seeded only)
- Drag-to-reorder pipelines (use up/down buttons or a `position` numeric input)
- Bulk multi-conversation move
- Per-pipeline analytics / KPIs
- Sub-pipeline hierarchy (we use flat names with `/` convention instead)

---

## Product Decisions

1. **Flat pipelines, slash-named.** "Ads / India", "Ads / Bangladesh", "Ads / Germany" are independent rows in `pipelines`. No parent/child relationship in the schema. The `/` is purely a display convention; the UI groups visually by splitting on the first `/`. This avoids a tree model we don't need yet.
2. **Stages are per-pipeline (already true in schema).** New pipelines get the same 9 default stages seeded by `createPipeline` in `src/lib/pipelines.ts`. No shared/global stages. Trade-off: stage edits don't propagate; acceptable because stage names are stable.
3. **Launch Wizard - pipeline is mandatory.** Default to workspace `is_default`. The Wizard never lets a campaign launch with `pipeline_id = NULL`.
4. **Inbound with no campaign match → workspace default pipeline.** Never leave inbound `conversations.pipeline_id = NULL` going forward. Legacy nulls stay queryable via the "Unassigned" filter bucket.
5. **One pipeline visible at a time on the Pipeline page.** No "All pipelines" mixed view in MVP - that view caused undefined ordering and confusion in the audit.
6. **Default pipeline cannot be deleted** (already enforced by RLS). Deleting a non-default pipeline reassigns its deals/conversations to the default (already implemented in `deletePipeline`).

---

## Phase 0 - P0 Correctness (ship first, no UI)

### 0.1 Pipeline-aware stage selection on deal auto-creation
Patch `public.ensure_deal_for_conversation`:
- Resolve target pipeline as: `conversations.pipeline_id` → workspace default pipeline (`pipelines.is_default = true`) → existing fallback (`ensure_pipeline_stage`).
- Pick the first `pipeline_stages` row WHERE `pipeline_id = <resolved>` ORDER BY `position`, `created_at`.
- Set `deals.pipeline_id` explicitly (don't rely solely on `sync_deal_pipeline_from_stage` trigger, but keep it as a safety net).

### 0.2 Inbound fallback when no campaign match
In `whatsapp-webhook` (or via a `BEFORE INSERT` trigger on `conversations`):
- If `pipeline_id` is null at insert time, set it to the workspace default pipeline id.
- Order of operations is critical: `conversations.pipeline_id` must be populated BEFORE `create_deal_for_new_conversation` fires. Easiest path: a `BEFORE INSERT` trigger on `conversations` that fills `pipeline_id` (mirrors the existing `fill_conversation_workspace_id` pattern).

### 0.3 Realtime behavior with a selected pipeline
- Realtime subscriptions stay **workspace-scoped** (already fixed in last refactor). Do NOT add a `pipeline_id` filter on the channel - users switch pipelines often, and recreating the channel on every switch causes flicker.
- Filter by `pipeline_id` **client-side** in the React Query selector. Cache key includes `pipelineId`, but the websocket channel does not.
- On payload arrival: invalidate the active pipeline's query if `payload.new.pipeline_id` matches the selected pipeline OR `payload.old.pipeline_id` matched (to handle "moved out" case).

### 0.4 Legacy `NULL` safety
- All new pipeline-filter queries use: `WHERE pipeline_id = $1 OR (pipeline_id IS NULL AND $1 = <default_id>)` for the default pipeline view, so legacy rows surface there until backfill runs.
- "Unassigned" filter option in Inbox explicitly queries `pipeline_id IS NULL`.

---

## Phase 1 - Data Migration (run after 0.1-0.2 deployed)

### 1.1 Ensure every workspace has a default pipeline
- One-shot migration that calls the equivalent of `ensureDefaultPipeline` for every workspace lacking a default.

### 1.2 Backfill nulls
```
UPDATE conversations c SET pipeline_id = p.id
  FROM pipelines p
  WHERE c.pipeline_id IS NULL AND p.workspace_id = c.workspace_id AND p.is_default;

UPDATE deals d SET pipeline_id = p.id
  FROM pipelines p
  WHERE d.pipeline_id IS NULL AND p.workspace_id = d.workspace_id AND p.is_default;
```
- Run as a migration. Reversible (set back to NULL only if needed - not planned).
- Safety: run inside a transaction; report row counts; verify each affected workspace has exactly one `is_default = true`.

### 1.3 Stage repair
- For deals where `deals.stage_id`'s `pipeline_id` doesn't match `deals.pipeline_id`, move them to the first stage of `deals.pipeline_id`. Should be rare after 0.1, but the migration covers pre-fix rows.

---

## Phase 2 - P1 MVP UI

### 2.1 Settings → Pipelines tab
- New tab in `WorkspaceSettings.tsx` (alongside Team/Brand/Numbers/Templates).
- List pipelines with: color swatch, name, "default" badge, deal count, position controls, rename, delete.
- "New pipeline" dialog: name + color → calls `createPipeline` (already seeds default stages).
- "Set as default" action (only one default per workspace; toggling moves the flag).
- Delete confirmation that explains "all deals and conversations on this board will move to <default board name>".

### 2.2 Pipeline page selector
- URL: `/ws/:slug/pipeline?pipeline=<id>`. If absent, redirect to default.
- Top-of-page tab strip (or `<Select>` if >5 pipelines) listing all workspace pipelines.
- `fetchPipelineBase` updated to accept `pipelineId` and filter both stages and deals on it.

### 2.3 Inbox pipeline filter
- New filter control in `CRM.tsx` filter row: pipeline `<Select>` with options: each pipeline + "Unassigned" + "All".
- Default to workspace default pipeline (saves user click; matches Pipeline page behavior).
- Persist last-selected per workspace in `localStorage`.

### 2.4 "Move to pipeline" action
- Conversation: action in conversation header dropdown → `<Select>` of pipelines → on confirm, update `conversations.pipeline_id`. The `propagate_deal_pipeline_to_conversation` trigger pattern works in reverse via existing `sync_deal_pipeline_from_stage`; we additionally need to move the linked deal to the first stage of the new pipeline (do it in app code, single transaction).
- Deal: same dropdown on the deal card / drawer → updates `deals.pipeline_id` AND `deals.stage_id` to the first stage of the target pipeline. Trigger `propagate_deal_pipeline_to_conversation` then syncs the conversation.

### 2.5 Launch Wizard polish
- Inline "+ Create new pipeline" link in the pipeline `<Select>` that opens a small dialog and then re-selects the new pipeline (no full page navigation).

---

## Risks & Trade-offs

| Risk | Mitigation |
|---|---|
| Backfill mis-assigns historical conversations to "default" when they belong elsewhere | Acceptable for MVP (no other signal exists); users can move them via the new action. |
| Two `is_default = true` rows for one workspace | Add a partial unique index `(workspace_id) WHERE is_default` in the same migration. |
| Realtime payload arrives without `pipeline_id` populated (race with trigger) | Trigger fills `pipeline_id` BEFORE INSERT, so the realtime payload always carries it. |
| Stage drift between pipelines confuses users | Out of MVP scope; document that stages are independent per pipeline. |
| Moving a conversation also reassigns its deal silently | Show a toast: "Conversation and linked deal moved to <pipeline>". |
| Deleting a pipeline with thousands of deals | Existing `deletePipeline` does it in two `UPDATE`s; fine up to ~50k rows. Add a confirm count. |

---

## Acceptance Criteria - Manual Test Checklist

Setup: ISKRA workspace, fresh login as workspace manager.

1. **Create pipeline**
   - Settings → Pipelines → New → "Ads / India" + color → appears in list with 9 default stages.
2. **Rename pipeline**
   - Inline rename "Ads / India" → "Ads / India PRO" → reflects on Pipeline page selector and Inbox filter immediately.
3. **Set default**
   - Toggle "Other" as default → "US" loses badge → only one default exists (verify in DB).
4. **Launch campaign into pipeline**
   - Launch Wizard → pick "Ads / Bangladesh" → schedule → `campaigns.pipeline_id` is set.
5. **Receive reply (campaign match)**
   - Simulate inbound from a campaign recipient → conversation appears with `pipeline_id = Ads / Bangladesh` → linked deal lands on the first stage of "Ads / Bangladesh".
6. **Receive reply (no campaign match)**
   - Inbound from unknown number → conversation gets `pipeline_id = workspace default` → deal lands in default's first stage.
7. **Inbox filter**
   - Switch filter to "Ads / Bangladesh" → only matching conversations visible. Switch to "Unassigned" → only legacy null-pipeline conversations visible. Switch to "All" → everything.
8. **Pipeline page**
   - URL `?pipeline=<US id>` → only US deals visible. Switch tab to "Ads / India PRO" → URL updates → only those deals shown.
9. **Move conversation**
   - From conversation header in Inbox → Move to → pick "US" → conversation disappears from current filter, reappears under US filter; linked deal now on US's first stage.
10. **Move deal**
    - On Pipeline page, deal action → Move to "Other" → deal disappears, reappears in Other; linked conversation's `pipeline_id` updated.
11. **Legacy rows**
    - Pre-backfill: open Inbox with default filter → legacy null conversations still appear.
    - Post-backfill: same conversations now appear under their workspace's default filter (not "Unassigned").
12. **Delete pipeline**
    - Delete "Ads / Germany" (non-default) → confirmation shows N deals will move → after confirm, those deals visible under default pipeline.
13. **Realtime**
    - Two browsers, same workspace, same default filter → mark a deal moved in browser A → browser B's Inbox/Pipeline updates without manual refresh.

---

## Implementation Phases (delivery order)

```
Phase 0 (DB only, no UI-visible change)
  0.1 ensure_deal_for_conversation patch
  0.2 BEFORE INSERT trigger: fill conversations.pipeline_id
  0.3 unique partial index: one default per workspace

Phase 1 (data migration, run once)
  1.1 ensure default exists per workspace
  1.2 backfill nulls on conversations + deals
  1.3 stage repair for mismatched deals

Phase 2 (UI)
  2.1 Settings → Pipelines tab
  2.2 Pipeline page selector + URL state
  2.3 Inbox pipeline filter (with Unassigned + All)
  2.4 Move-to-pipeline actions
  2.5 Launch Wizard inline create-pipeline

Phase 3 (verify)
  Run the 13-step manual checklist above on staging workspace.
```

Each phase is independently shippable. Phase 0 is invisible but unblocks everything else and stops new bad data. Phase 1 cleans history. Phase 2 ships the user-visible MVP.
