
# CRM Cleanup & Optimization Audit

Read-only audit of the recent multi-pipeline / dispatch / templates / fleet / Slack work. No code changes proposed yet — only findings and a prioritized cleanup order.

---

## 1. P0 correctness risks (fix before scaling further)

### 1.1 `processQueue` send loop — duplicate-send & "stuck sending" risk
`supabase/functions/campaigns/index.ts` (`processQueue`):
- Each tick claims rows due in the next ~55s and **sleeps inside the function** until each recipient's `scheduled_at`. The cron schedule is `* * * * *`, so a second tick fires at +60s while the previous is still sleeping. The conditional `UPDATE ... WHERE status = 'scheduled'` is the only guard against double-sends; if any row's status was nudged out of "scheduled" by another path (e.g. `redistribute`, `pause→resume`, manual edit, reaper) the lock can fail open or duplicate.
- A recipient already moved to `sending` by the previous tick (e.g. Gupshup call hung, function timed out) **never gets recovered** — there is no "sending older than N min → reset to scheduled or fail" reaper. `reap_finished_campaigns` only handles whole-campaign completion.
- Risk grows linearly with active number count because shards run in parallel and each holds its row in `sending` until response.

### 1.2 `lead-dispatch` race on multi-tick claim
`lead-dispatch/index.ts`:
- Claim filter is `status IN (pending, awaiting_manual) AND campaign_recipient_id IS NULL`, but there's no row-level lock or `FOR UPDATE`. Two overlapping cron runs (e.g. one slow on Gupshup token fetch) can both claim the same lead, both insert a `campaign_recipients` row, and the slower update will silently fail — producing **orphan recipients that send anyway** (the cancellation branch only triggers when the `lead_imports` update returns an error, not when it returns 0 rows).
- The hard-duplicate guard queries `campaign_recipients` by phone + pipeline + kind, but does not include other senders' first-touch campaigns from sibling pipelines. If the same lead is in two pipelines (rare but possible), it sends twice.
- Per-campaign `total_recipients` is read-then-write without a transaction → races under concurrent ticks.

### 1.3 `templates-status-sync` Slack duplicate notifications
`templates-status-sync/index.ts`:
- For each number, fetches its `message_templates` snapshot, calls Gupshup, then writes status updates **one-by-one** before the diff is posted. If the Slack post fails or the function times out mid-loop, the next hourly run sees no diff (DB is already updated) → **silent drop** of the notification.
- Manual "Sync from Gupshup" in Fleet shares the same write path; if a manager clicks Sync between cron ticks, the cron run shows no diff and the operator believes nothing changed. There is no `last_notified_status` separate from `status`.

### 1.4 `whatsapp-webhook` ambiguous-number routing
`whatsapp-webhook/index.ts` matches by `provider_app_id`, then `label`, then `phone_number`. The `label` fallback is risky — `label` is human-edited (`01Ashik02` style) and the schema does not enforce uniqueness. When two numbers share a label, the function logs `ambiguous_label` and **drops the message**. Inbound replies to that number become invisible to operators with no surface signal in the UI (only logs).

### 1.5 Mixed user-scoped + workspace-scoped RLS on `campaigns` / `campaign_recipients` / `conversations` / `deals`
RLS policies still include legacy `auth.uid() = user_id` UPDATE/DELETE policies alongside new workspace-scoped ones. Any team member can mutate rows owned by another member via the workspace policy, but the legacy UPDATE policy also allows the original owner to bypass pipeline scoping. Combined with `member_pipeline_scope` recently added, two policies are in play simultaneously — current behavior is "OR of all permissive policies", which means **pipeline scoping can be bypassed** by an owner for their own rows even if the new scoped policy denies them.

### 1.6 `campaigns.total_recipients` and per-day counters drift
`launchCampaign` writes `total_recipients` once, but `lead-dispatch` and `redistribute` paths both adjust `campaign_recipients` without updating the parent row atomically. The campaigns page reads from `campaigns` summary view; "Today" / "Total" can be wrong after pause→resume or skip-day operations.

### 1.7 Slack routing for first-touch dispatch
`lead.dispatched` enqueues with `pipeline.slack_channel_id`. If the channel was rotated or archived, `slack-dispatch` silently fails (no retry surface), and the operator sees zero feedback that the campaign launched.

---

## 2. P1 performance issues

### 2.1 Fleet Registry (`src/pages/admin/FleetRegistry.tsx` `fetchFleet`)
**Largest single perf hotspot.** One mount issues 8 unscoped queries:
- `whatsapp_numbers` *
- `message_templates` (all rows, all workspaces)
- `whatsapp_message_events` `.limit(20000)`
- `campaign_recipients` (no limit, no projection of campaign)
- `campaigns` (all)
- `conversations` (all)
- `messages` (all, every row, only `direction` + `conversation_id`)

For an active fleet this is hundreds of MB to the browser and full-table scans server-side. None of it is paginated, indexed by workspace, or memoized across mounts. This will be the first thing to break as data grows.

### 2.2 `WorkspaceCampaigns` recipient pagination
`fetchRecipientsLite` / `fetchRecipientsFull` page through every recipient **per campaign in the group, sequentially** (no `Promise.all`, 1000 at a time). For multi-number first-touch campaigns this is N campaigns × full history — easily 10k+ rows even for a mid-size client. They run on every detail expand and on every invalidate after pause/resume/cancel.

### 2.3 `crmData.fetchCrmBase` second-pass `messages.in(conversation_id, …)`
After fetching 200 conversations, it issues a second query selecting every inbound `messages` row for those 200 conversations just to compute `repliedConversationIds`. For active workspaces this returns 5–50k rows per CRM open. Should be a single boolean column or a view.

### 2.4 Realtime subscriptions
Only CRM and Pipeline use `useRealtimeTable`, but each subscribes to `conversations` and `messages` on `*` (no filter). Every Postgres change in the workspace pushes to every open tab. With Slack-driven inbound bursts this floods React Query. Filters by `workspace_id` (already supported in postgres_changes) are missing.

### 2.5 `processQueue` per-campaign recount loop
After each tick it issues 3 `count exact` queries per campaign touched. With multi-number campaigns this fans out to dozens of count queries every minute. A single `group by campaign_id` aggregate would replace the loop.

### 2.6 `templates-status-sync` N+1 per number
For each active number: one Supabase select for snapshot, one Gupshup call, then one `UPDATE` per changed template (no batch). At full fleet this is `numbers × (1 + 1 + changed)` round trips per cron run.

### 2.7 Heavy page components re-render the whole tree
`LaunchWizard` (1,653 lines), `FleetRegistry` (1,362), `WorkspaceData` (977), `PipelineConfigSheet` (861) each hold all wizard / page state in one component with many `useMemo` dependencies on raw fetched arrays. Any small state change re-derives all groupings. No virtualization on long recipient/lead lists.

### 2.8 No pagination/virtualization
- `WorkspaceCampaigns` recipient list (full mode) renders every row when "Show recipients" is opened.
- `FleetRegistry` numbers list — full table.
- `WorkspaceData` audience preview — tables are unvirtualized.

---

## 3. P1 architecture cleanup opportunities

### 3.1 Oversized files (top offenders)
| File | LOC | Concrete split |
|---|---|---|
| `pages/workspace/LaunchWizard.tsx` | 1,653 | Extract steps (audience picker, schedule, review, template-group, slack-summary) into per-step components in `components/workspace/launch/`; move scheduling math (now copy-pasted from `campaigns/index.ts`) into a shared `lib/scheduling.ts`. |
| `supabase/functions/campaigns/index.ts` | 1,395 | Split into `_shared/scheduling.ts`, `_shared/gupshupTemplates.ts`, `_shared/sendOpener.ts`; the function file should just be the HTTP router. |
| `pages/admin/FleetRegistry.tsx` | 1,362 | Extract `useFleetData` hook (paginated + scoped), `FleetRow`, `FleetGroup`, `AddNumberDialog` (≈300 lines inline), `NumberDetailDrawer`. |
| `pages/workspace/WorkspaceData.tsx` | 977 | Split mapping UI, validation preview, derived-vars editor. |
| `components/workspace/PipelineConfigSheet.tsx` | 861 | Each tab into its own component; readiness checklist into its own hook. |

### 3.2 Duplicated business logic
Scheduling helpers (`hhmmToMin`, `dateAtTzToUTC`, `tzOffsetMinutes`, `exponentialGap`, `tzFromPhone`) are duplicated between `campaigns/index.ts` and `lead-dispatch/index.ts` with subtle drift (lead-dispatch handles `00:00` as end-of-day, campaigns doesn't). Same drift exists for window-fit quota math. Consolidate into `supabase/functions/_shared/scheduling.ts`.

### 3.3 Mixed responsibilities
- `LaunchWizard.tsx` contains data fetching, validation, scheduling preview math, AND submission UX.
- `WorkspaceCampaigns.tsx` mixes summary listing, action dispatch, and detail panel including its own pagination loops.
- `crmData.ts` does fetching and derivation; the `repliedConversationIds` set should live on a view.

### 3.4 Weak UI ↔ data boundaries
- `pages/CRM.tsx` and `pages/Pipeline.tsx` each carry their own copy of "find conversation by id, set assigned_user_id, optimistically update array" instead of going through a `useAssignConversation` hook. Slight divergences already exist (CRM clears `active_responder_id` in some branches, Pipeline doesn't).
- `useRealtimeTable` is only used in 2 places; everything else drops realtime or rolls its own.

### 3.5 Brittleness from recent additions
- `variables.__tpl_id` is a magic key on `campaign_recipients.variables` to carry the per-recipient template override. It survives only because every read site remembers to look there. Should be a real column.
- `lead_imports.campaign_recipient_id` is the only thing preventing duplicate dispatch — but it's not enforced via a unique index, just convention.
- Multiple cron jobs (`process-campaigns`, `lead-dispatch`, `slack-dispatch`, `google-sheets-sync`, `templates-status-sync`) all on `* * * * *` with no jitter — they collide every minute hitting Postgres + Gupshup.

---

## 4. P1 operator UX issues

### 4.1 Internal `label` (e.g. `01Ashik02`) leaks into operator-facing UI
Per `friendlySenderLabel` rule in `src/lib/crmData.ts`, `label` is an internal fleet handle. Today it appears in:
- `WorkspaceCampaigns.tsx` lines 158, 297 — campaign list and detail show `n.label ?? +phone`.
- `LaunchWizard.tsx` lines 899, 982 — number picker and review show `n.label ?? +phone`.

Operators see `01Ashik02` instead of "UAE main · +9715…" and can't tell numbers apart at a glance.

### 4.2 Confusing campaign states
- A campaign appearing as "running" in the header but "scheduled" in the day-bucket table when `processQueue` hasn't promoted it yet (within the 60s window).
- Pause/Resume button + Re-balance + Cancel + Skip day all on the same row with identical neutral styling — easy to mis-click. Cancel uses `confirm()`; Skip day does not.
- "Today" badge can show 0 even when leads are queued for today if `first_scheduled_at` is in tomorrow's window for some buckets and today's for others (multi-tz campaigns).

### 4.3 Template approval visibility
- Fleet banner shows per-number readiness, but **inside a campaign launch** there is no "X of Y approved on this number" gate — the wizard happily lets you select a number whose template is `pending`, then dispatch fails downstream. Should block at selection.
- Slack digest formatting uses code spans for template names; long names wrap badly on mobile Slack.

### 4.4 Pipeline / scope readability
- In CRM, conversations from pipelines the user can't access are filtered out silently — there's no "X conversations hidden by your scope" hint, so a manager onboarding a member can't tell whether the new member is missing data due to RLS or due to no leads.
- `assigned_user_id` and `active_responder_id` are both shown but never explained; operators have asked which one wins.

### 4.5 Errors that disappear
- `lead-dispatch` `blocked()` posts a Slack note once per hour per (pipeline, reason). Inside the app, a paused / blocked first-touch pipeline shows no banner — operators rely on Slack alone.
- Webhook `ambiguous_label` / `ambiguous_provider_app_id` writes to logs only.

---

## 5. Recommended implementation order

### Must fix before scaling further (this cleanup pass)
1. **Fleet Registry data fetch** — scope to active workspace, paginate, drop the "all messages / all conversations" pulls. Single biggest win.
2. **`processQueue` correctness** — add `sending`-stuck reaper, replace per-campaign recount loop with a single aggregate, document the lock contract.
3. **`lead-dispatch` claim race** — add unique index on `lead_imports(pipeline_id, phone, status='queued')` or atomic `UPDATE ... RETURNING`; cancel orphan recipients when `UPDATE` returns 0 rows (not only on error).
4. **RLS dual-policy cleanup** — drop legacy `user_id`-only UPDATE/DELETE policies on `campaigns`, `campaign_recipients`, `conversations`, `deals`; rely on workspace-scoped policy + pipeline scope only.
5. **`label` leak in operator UI** — replace `n.label ?? +phone` with `friendlySenderLabel` in `WorkspaceCampaigns` and `LaunchWizard`.
6. **Templates auto-sync idempotency** — store `last_notified_status` separate from `status`; diff against `last_notified_status` so failed Slack posts don't lose a notification.

### Next cleanup pass (immediately after)
7. Extract shared `_shared/scheduling.ts` and remove duplication between `campaigns/` and `lead-dispatch/`.
8. Split `LaunchWizard` into per-step components and `FleetRegistry` into hook + row + dialog.
9. Replace `variables.__tpl_id` magic key with a real `campaign_recipients.template_id` column.
10. Filter realtime subscriptions on `conversations` / `messages` by `workspace_id` (and `pipeline_id` where relevant).
11. Replace `crmData.fetchCrmBase`'s second-pass inbound query with a `conversations_with_reply_flag` view (or a `has_inbound` boolean kept by trigger).
12. Block the launch wizard's number picker when its template is not `approved`; surface "X approved / Y pending" inline.
13. Add jitter to the `* * * * *` cron family (e.g. `0,15,30,45 * * * *` for some, offset by 30s) so they don't all stampede the minute boundary.
14. Add a `useAssignConversation` hook used by both CRM and Pipeline; remove duplicated optimistic update.

### Can wait
15. Virtualize long recipient / audience tables (only matters once a single client crosses ~5k rows in one view).
16. Extract `WorkspaceData` and `PipelineConfigSheet` into smaller components (large but currently stable).
17. UI tooltips clarifying `assigned_user_id` vs `active_responder_id`.
18. In-app banner mirror of `lead-dispatch` `blocked()` Slack notes.
19. Webhook ambiguity → admin banner instead of logs only.

---

**Scope reminder:** none of this is a redesign. Items 1–6 are surgical fixes to recent changes; 7–14 are mechanical splits/dedup; 15–19 are quality-of-life. Estimated 1–2 days for the "must fix" block before it's safe to add more features.
