
# Permission-based workspace access

Goal: replace coarse `admin / manager / client` route gates with explicit per-user permission flags. The `role` column stays as a free-text label (badge only) and global admin (`arseny@iskra.ae`) keeps full access. The "retry failed lead" flow we just shipped keeps working - it only requires Pipeline access (which everyone gets by default in migration).

## 1. Permission model

Per workspace member, boolean toggles:

| Key | Controls |
|---|---|
| `perm_overview` | Overview tab + stats route |
| `perm_inbox` | Inbox tab + `/inbox` route |
| `perm_pipeline` | Pipeline tab + `/pipeline` route (and Retry button on failed cards) |
| `perm_campaigns_view` | Campaigns tab (read-only campaign reports) |
| `perm_quick_replies_use` | Library tab + use quick replies in composer |
| `perm_quick_replies_manage` | Create/edit/delete **shared** workspace quick replies (personal ones always allowed if `perm_quick_replies_use`) |
| `perm_settings` | Settings tab (team, brand, pipelines, numbers, templates) |
| `perm_data` | Data tab |
| `perm_materials` | Materials tab |
| `perm_launch` | Launch button in sidebar + `/launch` route + "Launch first campaign" CTA |

Global admin (`is_admin(uid)`) and workspace owner (`workspaces.owner_user_id`) always bypass all checks - they implicitly have every permission.

## 2. Data model changes

Migration on `workspace_members`:

- Add ten `boolean NOT NULL DEFAULT false` columns listed above.
- Keep existing `role` (informational label) and `can_view_stats` (kept for backward read compat, but no longer gates anything).
- Replace `is_workspace_manager` usage in app code with a new SQL helper:
  ```
  has_workspace_permission(_workspace_id, _user_id, _perm text) returns boolean
  ```
  Returns true if admin, workspace owner, or `workspace_members.<perm column> = true`.
- RLS policies that currently use `is_workspace_manager` on `workspace_saved_replies`, `pipelines`, `templates`, etc. are updated to call `has_workspace_permission(..., 'perm_settings')` or the corresponding flag. **Owners-manage-memberships policy on `workspace_members` itself is untouched** so settings access can't be self-escalated.
- `retry_lead_import` RPC is unchanged - it already checks `is_workspace_member + can_access_pipeline`, both of which remain.

### Migration of existing rows

Backfill in the same migration:

- `role = 'manager'` → all ten flags = true.
- `role = 'client'` with `can_view_stats = true` → `inbox, pipeline, overview, campaigns_view, quick_replies_use` = true.
- `role = 'client'` with `can_view_stats = false` → `inbox, pipeline, quick_replies_use` = true.
- `perm_launch`, `perm_settings`, `perm_data`, `perm_materials`, `perm_quick_replies_manage` stay false for every existing client. (Owners are unaffected - they bypass via `is_workspace_owner`.)

New invites default to `inbox + pipeline + quick_replies_use` unless inviter ticks more.

## 3. Files changed

**SQL (one migration):**
- `supabase/migrations/<new>.sql` - add columns, backfill, create `has_workspace_permission`, rewrite affected RLS policies.

**Access layer:**
- `src/lib/workspaceRole.ts` - replace `useWorkspaceAccess` return shape with `{ role: string; permissions: Record<PermKey, boolean>; isOwner: boolean; isAdmin: boolean }`. Add `usePerm(workspaceId, key)` helper. Keep `isManagerLike`/`isAdmin` exports as thin shims (admin only) so non-migrated callers still compile, then remove them once everything is converted.

**Routing & shell:**
- `src/components/workspace/WorkspaceSidebar.tsx` - build tab list from permissions, not role buckets. Fix `NavLink` `end` flags so Inbox/Pipeline/Overview/Campaigns highlight correctly (use `end` only on the index route; others rely on path prefix match).
- `src/pages/workspace/WorkspaceLayout.tsx` - `RoleGuardedOutlet` switches to a per-route permission map:
  ```
  overview → perm_overview, inbox → perm_inbox, pipeline → perm_pipeline,
  campaigns → perm_campaigns_view, library → perm_quick_replies_use,
  settings → perm_settings, data → perm_data, materials → perm_materials,
  launch → perm_launch
  ```
  Redirect target = first permitted section (fallback: sign out with toast if none).

**Team UI:**
- `src/components/workspace/TeamView.tsx` - per-member permissions editor: a compact grid of switches (one row per member, one column per permission, plus the role label as free text). Inviter dialog gets the same grid with sensible defaults. Removes the existing `can_view_stats` switch.

**Per-screen gates / CTA cleanup:**
- `src/pages/workspace/WorkspaceOverview.tsx` - "Launch first campaign" CTA hidden unless `perm_launch`; replaced with "Open Inbox" for non-launchers.
- `src/pages/workspace/WorkspaceCampaigns.tsx` - launch/create buttons gated on `perm_launch`; read view on `perm_campaigns_view`.
- `src/components/workspace/WorkspaceLibrary.tsx` - personal replies always editable; shared section read-only unless `perm_quick_replies_manage`.
- `src/components/workspace/PipelinesView.tsx` - edit actions gated on `perm_settings`.
- `src/pages/workspace/WorkspaceSettings.tsx` - already only mounts when route is permitted; no inner change needed.

## 4. How each surface behaves after the change

- **Team access UI:** A simple Google-style table - left column is the user (avatar + email + free-text role badge), then one switch per permission. Saving updates `workspace_members` directly via the existing `owners-manage-memberships` RLS policy.
- **Quick Replies:** Tab appears only if `perm_quick_replies_use`. Inside, "Shared" tab is view-only without `perm_quick_replies_manage` (create/edit/delete buttons hidden, RLS enforces same on the server). Personal replies are always editable by their owner.
- **Launch protection:** Launch sidebar item, `/launch` route, and any "Launch campaign / Launch first campaign" CTAs across Overview, Campaigns, empty states are wrapped in `permissions.perm_launch`. Route guard returns `Navigate` to the user's first permitted section. RLS on campaign-creating tables already requires `is_workspace_manager`; we change that to `has_workspace_permission(..., 'perm_launch')`.
- **Retry failed leads (recently added):** Unchanged. RPC still checks `is_workspace_member + can_access_pipeline`. Any user with `perm_pipeline` (everyone, by migration default) can fix the number and resend.

## 5. Mapping summary for existing users

| Today | After migration | Net change |
|---|---|---|
| admin email | bypasses all | none |
| workspace owner | bypasses all | none |
| `role=manager` member | all 10 perms on | same access |
| `role=client`, stats on | inbox, pipeline, overview, campaigns_view, quick_replies_use | loses nothing they had |
| `role=client`, stats off | inbox, pipeline, quick_replies_use | gains explicit quick replies use (matches today's behavior); loses nothing |

No one loses access; no one silently gains Launch or Settings.

## 6. Manual test matrix

Create three test members in one workspace:

1. **Operator** = inbox + pipeline + quick_replies_use only.
   - Sidebar: only Inbox + Pipeline + Quick replies.
   - Direct nav to `/launch`, `/settings`, `/campaigns`, `/overview`, `/data`, `/materials` → redirected to `/inbox`.
   - Failed lead card in Pipeline → Retry dialog opens, fix number, lead re-queues. (validates the access we just built)
   - Quick replies: shared tab read-only, personal editable.

2. **Closer** = operator + overview + campaigns_view + quick_replies_manage.
   - Sees Overview, Campaigns tabs; no Launch button.
   - Overview shows "Open Inbox" CTA instead of "Launch first campaign".
   - Can edit shared quick replies.
   - `/launch` direct nav → redirected to `/overview`.

3. **Full manager** = all perms on.
   - Sees every sidebar item including Launch and Settings.
   - Can edit team permissions for Operator/Closer.
   - Launch wizard works end-to-end.

4. **Sidebar highlighting** sanity: navigate Overview → Inbox → Pipeline → Campaigns and confirm only the active item is highlighted (no stale Overview highlight on `/inbox`).
