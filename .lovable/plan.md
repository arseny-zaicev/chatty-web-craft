## Goal

Allow a workspace owner / manager to invite someone as **Client** and scope their access to one or more specific pipelines. A scoped client should only see:
- those pipelines (and their stages) in the Pipeline page,
- conversations belonging to those pipelines in the Inbox,
- stats / Overview / Campaigns filtered to those pipelines,
- nothing else from the workspace.

The column `workspace_members.allowed_pipeline_ids uuid[]` already exists but is unused. We build on top of it. Convention:
- `NULL` or empty array → full access (current behaviour, used by managers and "open" clients).
- Non-empty array → restricted to exactly those pipeline ids.

---

## 1. Database

**Migration**

- Add `allowed_pipeline_ids uuid[]` to `workspace_invite_links` so the scope is captured at link creation and applied automatically on accept.
- Helper `public.member_pipeline_scope(_workspace_id uuid, _user_id uuid) returns uuid[]` (security definer): returns `NULL` for managers/owners/admins or for clients with no restriction; returns the array otherwise.
- Helper `public.can_access_pipeline(_workspace_id uuid, _user_id uuid, _pipeline_id uuid) returns boolean`: `true` if scope is `NULL`, otherwise `_pipeline_id = ANY(scope)`.
- Update RLS SELECT policies (additive, ANDed with existing membership check) on:
  - `pipelines` — `can_access_pipeline(workspace_id, auth.uid(), id)`
  - `pipeline_stages` — same via `pipeline_id`
  - `conversations` — `pipeline_id IS NULL OR can_access_pipeline(...)` (NULL conversations only visible to non-scoped members)
  - `deals` — same via `pipeline_id`
  - `messages` — via the conversation's pipeline
  - `campaigns` — same via `pipeline_id`
  - `campaign_recipients` — via the campaign's pipeline
  Existing `Users view own ...` policies are left intact (the user can still see rows they own); the new policies only further constrain *workspace member* visibility.
- The `Workspace members ...` policies are tightened to additionally require `can_access_pipeline(...)`.

**Behaviour for `pipeline_id IS NULL`**: only unrestricted members see those rows. Scoped clients should never see "uncategorised" data.

---

## 2. Edge function `workspace-invite-link`

- `action=create` accepts an optional `pipeline_ids: string[]` body field. Validate every id belongs to `workspace_id`. Persist on the new column.
- `action=info` returns `pipeline_ids` (with names) so the join page can show "You will get access to: Ads / India".
- `action=accept` copies `pipeline_ids` from the link to the new `workspace_members.allowed_pipeline_ids`.
- `action=members` returns `allowed_pipeline_ids` (already in `workspace_members`).
- New `action=update_access`: body `{ id, allowed_pipeline_ids }` for owners/admins to change a member's scope after the fact.

---

## 3. UI - `TeamView` (Settings -> Team & client access)

**Invite link dialog**
- Role select (existing).
- When role = **Client**, show a "Pipeline access" multi-select below seat limit:
  - Default: "All pipelines" (chip).
  - Add chips for each pipeline; toggling makes the link scoped.
  - Helper text: *"Choose which boards this client can see. Leave empty for full access."*
- When role = **Manager**, the picker is hidden (managers always have full access).

**Member rows**
- For client members, show pipeline access summary line: *"Access: Ads / India, Outbound / UK"* or *"Access: All pipelines"*.
- Add an "Edit access" pencil icon → small popover with the same multi-select, calling `action=update_access`.

**Active links list**
- Each link's metadata line gets a third segment listing pipeline scope (or "all").

---

## 4. Frontend filters / readouts

Most filtering happens automatically because RLS hides rows. Two cosmetic touches:

- `Pipeline.tsx`: the pipeline tab list already comes from the `pipelines` query, which will now return only allowed boards; default-pipeline fallback must pick the first *visible* pipeline if the workspace default is hidden from the user.
- `CRM.tsx`: pipeline filter dropdown options come from the same query. Hide the "Unassigned" option for scoped clients (they can't see unassigned conversations anyway).
- `WorkspaceOverview` / `WorkspaceCampaigns`: stats are already keyed off conversations / campaigns rows that RLS now filters, so numbers will reflect only allowed pipelines automatically. No code change required beyond verifying empty-state copy.

---

## 5. Out of scope (explicitly)

- No per-stage permissions.
- No "read-only on pipeline X" - access is binary per pipeline.
- Pipeline scope does **not** override `can_view_stats`; both are independent toggles for clients.
- We do not retroactively restrict existing client members; their `allowed_pipeline_ids` stays `NULL` (full access) until an owner edits it.

---

## Files touched

- New migration: invite link column + 2 SQL helpers + RLS policy updates on 7 tables.
- `supabase/functions/workspace-invite-link/index.ts` - 3 actions touched, 1 added.
- `src/components/workspace/TeamView.tsx` - link dialog + member row scope UI.
- `src/pages/Pipeline.tsx` - default-pipeline fallback when default is hidden.
- `src/pages/CRM.tsx` - hide "Unassigned" option for scoped clients (small).
- `src/integrations/supabase/types.ts` - regenerated automatically after migration.