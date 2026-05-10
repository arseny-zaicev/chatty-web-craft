## Scope

Finish the multi-pipeline MVP with four tightly-scoped UI additions. No schema changes, no refactors, no work outside the listed items.

---

## 1. Inbox pipeline filter (`src/pages/CRM.tsx`)

- Load workspace pipelines via `useQuery(pipelinesKey, fetchPipelines)` (only when `workspaceId`).
- Add new state `pipelineFilter: "all" | "unassigned" | <pipelineId>`, default `"all"`.
- Render a `<Select>` (or compact pill-row, matching the existing filter chip style) in the left aside header alongside the number/starred/my chats chips. Order: `All pipelines`, `Unassigned`, then each pipeline (with color dot + name).
- Extend the existing `filtered` computation:
  - `"all"` -> no constraint
  - `"unassigned"` -> `c.pipeline_id == null`
  - `<id>` -> `c.pipeline_id === id`
- `Conversation` type already has `pipeline_id` (verified in `src/lib/crmData.ts`); no data-layer change required.
- Backward compat: legacy rows with `pipeline_id = null` are reachable via `Unassigned`.

## 2. Move conversation to pipeline (`src/pages/CRM.tsx`)

- In the active conversation header (right of the existing AssigneeSelect / number badge), add a small `<Select>` labeled by current pipeline color+name.
- On change, call `moveConversationToPipeline(active.id, newPipelineId)` (already exists in `src/lib/pipelines.ts`; it also moves linked deal to first stage of target pipeline).
- Optimistic update of local `conversations` state; on error rollback + toast. Realtime will reconcile.
- Hidden when no pipelines loaded or no `workspaceId`.

## 3. Move deal to pipeline (`src/pages/Pipeline.tsx`)

- In the deal side `<Sheet>` body, add a `Field label="Pipeline"` with a `<Select>` of workspace pipelines (color dot + name). Default value = `activeDeal.pipeline_id ?? selectedPipelineId`.
- On change, call `moveDealToPipeline(activeDeal.id, newPipelineId)` (already exists). Show toast and close the sheet (deal will leave current board view via realtime filter).
- Pipelines list is already loaded in `Pipeline.tsx`; reuse it. No new fetch.

## 4. Inline "Create pipeline" in Launch Wizard (`src/pages/workspace/LaunchWizard.tsx`)

- The wizard already tracks `pipelineId` and sends it on launch, but there is no UI to pick it. Add a compact pipeline picker (no new step number — embed at the top of Step 6 "Campaign name", labeled `Pipeline`) with:
  - `<Select>` listing pipelines with color dot. Mandatory: prevents `pipelineId = null` going forward.
  - A trailing `+ New pipeline` button (ghost size sm) opening a small inline `<Dialog>` with `name` + `color` inputs.
  - On submit: `createPipeline(workspace.id, { name, color })`, then `qc.invalidateQueries(pipelinesKey(workspace.id))`, set `pipelineId` to the returned id, close dialog, toast.
- Launch button gets a guard: disable if `!pipelineId` (cannot happen in practice once pipelines load, but defensive).

---

## Out of scope (explicitly not changing)

- DB migrations, RLS, triggers (`ensure_deal_for_conversation` fix already shipped).
- Pipeline management UI (already in Settings).
- Pipeline page selector (already done).
- `crmData.ts` shape changes — `pipeline_id` already selected on conversations and deals.
- Security linter warnings unrelated to these changes.

## Files to change

- `src/pages/CRM.tsx` — filter + header move-to-pipeline select.
- `src/pages/Pipeline.tsx` — pipeline select inside deal sheet.
- `src/pages/workspace/LaunchWizard.tsx` — pipeline picker + inline create dialog inside Step 6.

## Manual QA checklist (post-implementation)

1. Inbox: switch pipeline filter -> list updates; "Unassigned" shows legacy null rows; "All pipelines" restores full list.
2. Open a conversation -> change pipeline in header -> conversation disappears from current pipeline filter; linked deal appears in target board's first stage; legacy rows still openable.
3. Pipeline page: open a deal -> change pipeline in sheet -> card removed from current board; appears in target board's first stage; linked conversation now reports new pipeline in Inbox header.
4. Launch Wizard: pipeline select pre-fills with default; click `+ New pipeline`, create one, it auto-selects; launch a campaign; verify `campaigns.pipeline_id` set and resulting conversations land on selected pipeline (visible via Inbox filter).
5. Build/typecheck/lint: harness runs automatically; report results.

## Reporting after implementation

Return: files changed, behaviors added, remaining gaps (none expected within scope), build/typecheck/lint status, and the QA checklist above.