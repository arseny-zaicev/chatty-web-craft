# Multi-pipeline per workspace

Today every workspace has one flat list of `pipeline_stages` and one Kanban. We introduce a `pipelines` (board) layer between the workspace and the stages, plumb it through Inbox, Pipeline, Launch and access control.

## 1. Data model

New table `pipelines` (one workspace -> many boards):

```text
pipelines
  id, workspace_id, user_id (creator)
  name, color, position
  is_default boolean
  created_at, updated_at
```

Schema changes:
- `pipeline_stages.pipeline_id` (uuid, FK -> pipelines.id, NOT NULL after backfill)
- `deals.pipeline_id` (uuid, denormalized from stage for fast filtering)
- `conversations.pipeline_id` (uuid, nullable — set when conv is linked to a deal/stream)
- `campaigns.pipeline_id` (uuid, nullable)
- `workspace_members.allowed_pipeline_ids uuid[]` (nullable = all pipelines; non-empty = restricted) — prepares per-board access without enforcing yet

Backfill:
- For each existing workspace, create one default pipeline `"Main"` (`is_default = true`), assign all existing stages/deals/conversations/campaigns to it.

RLS:
- `pipelines`: workspace members can SELECT; managers manage.
- Update existing stage/deal policies to keep working (no behavior change yet — `allowed_pipeline_ids` is read-only metadata for now; enforcement is a later task per requirement #6).

## 2. Inbox (CRM page)

- New `PipelineFilter` chip row at the top of the conversation list. Options: `All boards`, then one chip per pipeline (color dot + name).
- Filter state stored in `useState` + URL param `?board=<id>` so it survives refresh.
- Each conversation row gets a small colored **pipeline tag** (uses pipeline color + name) next to the contact name. Tag is hidden if the workspace has only one pipeline (keeps UI clean for single-board clients).
- The active conversation header also shows the pipeline tag, with a popover to **move conversation to another board** (updates `conversations.pipeline_id` and the linked deal's stage to that board's first stage).

## 3. Pipeline page

- Add a **board switcher** at the top (Pipedrive-style dropdown): current board name + chevron, list of boards, `+ New board`, `Manage boards`.
- Switching board re-queries stages/deals filtered by `pipeline_id`.
- `New board` opens a dialog (name, color). On create, seeds the same default 12 stages used today (`DEFAULT_WORKSPACE_STAGES` in `crmData.ts`).
- `Manage boards` dialog: rename, recolor, reorder, delete (delete blocked if it's the only/default board; otherwise reassigns deals to the default board first).
- Stage CRUD continues to work, but every stage is now scoped to the active board.

## 4. Launch wizard

- Add a **Step 0: Choose board** (skipped automatically if workspace has only one pipeline).
- The selected `pipeline_id` is:
  - persisted on the campaign (`campaigns.pipeline_id`),
  - used to scope template suggestions if a template is tagged with a board (future), and to scope the "audience preview" against the board's existing conversations (so we can warn about overlaps within the same stream),
  - propagated to every conversation created/touched by the launch so new chats land in the right Inbox filter and on the right Pipeline board.
- Sender/number, copy and templates remain selectable as today, but defaults can later be remembered per board (out of scope here — we just pass the context through).

## 5. Access control readiness

- `workspace_members.allowed_pipeline_ids` is added now, surfaced in the Team view as a multi-select per Client member ("All boards" by default).
- No enforcement in this PR — UI hooks (Inbox filter, Pipeline switcher, Launch board step) read the column and will hide non-allowed boards in a follow-up.

## 6. Files touched

Frontend
- `src/lib/pipelines.ts` (new) — list/create/update/delete boards, default-board helper
- `src/lib/crmData.ts` — add `pipeline_id` to fetch shapes; filter by board
- `src/lib/launchData.ts` — add `pipeline_id` to campaign create payload
- `src/pages/CRM.tsx` — board filter chips, pipeline tag in rows + header, "move to board" action
- `src/pages/Pipeline.tsx` — board switcher dropdown, new-board dialog, manage-boards dialog
- `src/pages/workspace/LaunchWizard.tsx` — board step + propagation
- `src/components/workspace/TeamView.tsx` — `allowed_pipeline_ids` multi-select for Clients

Backend
- One migration for the new table + columns + backfill + RLS

## 7. After-change explainer (will be in chat reply)

- **Multiple pipelines per client**: each workspace has N boards; default is one auto-created "Main" board. Managers create/rename/delete boards from Pipeline.
- **Inbox switching/filtering**: chip row at the top of Inbox; `All boards` or pick one. Active filter is in the URL.
- **Pipeline tag in Inbox**: each conversation row shows a small colored chip with the board name; only visible when the workspace has 2+ boards.
- **Launch uses the board context**: the wizard asks which board the campaign belongs to; the campaign and every resulting conversation inherit that `pipeline_id`, so they appear on the right board and under the right Inbox filter.
- **Access control**: per-member `allowed_pipeline_ids` is stored now and editable in Team; enforcement comes next.
