
# Same-day rollout plan: 5 companies, ~15 numbers

Today's reality (from current DB):
- 10 workspaces exist, only 2 are real (`ISKRA`, `Salesforge`); the rest are empty `Main workspace` shells with no numbers.
- 5 approved templates total, only 1 pipeline (`Nitish / Ads / India / Delivery`) has `auto_outreach_enabled=true`, daily_cap=200, **no Slack channel set**.
- 5 numbers across 2 workspaces (2 active, 2 ready, 1 stock). To reach 15 numbers today, ~10 more must be added/approved.

This plan optimizes for: small volume, fast isolation, zero cross-company blast radius.

---

## 1. Launch readiness audit

### Already strong enough
- **Lead intake → first-touch dispatch loop** (`lead-dispatch`) is mature: per-pipeline daily cap, sender round-robin, stuck-queue recovery (>10m), duplicate guard per pipeline, throttled "blocked" Slack alerts, immutable `pipeline_id` on `lead_imports`, status-transition guard trigger.
- **Conversation/deal plumbing**: triggers auto-create deals, propagate `pipeline_id` from campaign/recipient → conversation → deal, mark leads `replied` on inbound, reset unread on manager reply (just shipped).
- **Realtime + optimistic UI** for unread badge is fixed.
- **Workspace isolation primitives** exist: `is_workspace_member/manager`, `member_pipeline_scope`, `can_access_pipeline` (per-pipeline RLS scoping for non-owners).
- **Slack event queue** decouples sending from triggers — safe to throttle/replay.
- **Webhook replay** function exists for recovery.

### Still risky for a same-day multi-tenant launch
- **No global kill switch** per workspace or per pipeline besides `auto_outreach_enabled` on a pipeline. There is no "pause all sending for company X" button surfaced in admin.
- **Slack routing not enforced**: the active pilot pipeline currently has `slack_channel_id IS NULL`. If 5 companies launch and none have a channel set, all events fall back to default ops channels → cross-tenant noise and confusion.
- **Daily caps not standardized**: only one pipeline has a cap. A misconfigured template or bad lead file could burn an entire number's quality on day one.
- **Sender-number sharing risk**: nothing prevents the same `whatsapp_number_id` from being added to two pipelines (even across workspaces if an admin slips). One bad campaign poisons two clients.
- **Template variables fallback is generous** (`buildVariables` falls back to first name for any missing var). Good for not failing, bad for silently sending wrong content. No pre-flight template/variable preview check exists in the launch wizard path.
- **No "dry run" / canary**: the only way to verify is to send to a real lead. We need a staged "send to 1, wait, then release the rest" mode for first launch per company.
- **Stuck-recovery is generous (10m)**: fine, but combined with no per-pipeline kill switch, a misrouted campaign could re-queue itself before someone notices.
- **Workspace seeding is messy**: 8 empty `Main workspace` shells exist. Risk of onboarding into the wrong workspace.

### P0 blockers (must fix before first wave)
1. **Per-pipeline emergency pause** that the user can toggle from admin without a migration. `auto_outreach_enabled=false` exists but does not stop already-queued recipients in `campaigns/index.ts`. We need a single switch that (a) flips `auto_outreach_enabled=false` and (b) pauses any `running` first_touch campaigns under that pipeline.
2. **Mandatory Slack channel per pipeline at launch.** Block "go live" until `pipelines.slack_channel_id IS NOT NULL` for every launching pipeline.
3. **Conservative day-1 daily cap default** (e.g., 30/number/day for new pipelines; manager can raise later). Today's `daily_cap` is per-pipeline, not per-number — set pipeline cap = 30 × sender_count for day 1.
4. **Sender-number uniqueness check across active pipelines.** Refuse to set `default_sender_number_ids` if a number is already in another pipeline with `auto_outreach_enabled=true`.
5. **Empty-workspace cleanup** before onboarding so operators can't pick the wrong "Main workspace".

Everything else is "nice", not blocking.

---

## 2. Multi-company rollout plan (one day, 5 waves)

```text
Wave 0  (T-60m)  Pre-flight, infra + cleanup
Wave 1  (T+0)    Company A — 1 number, 5-lead canary
Wave 2  (T+90m)  Company B — full setup, 5-lead canary
Wave 3  (T+3h)   Companies C + D in parallel
Wave 4  (T+5h)   Company E
Wave 5  (T+6h)   Lift caps where green, end-of-day digest review
```

Sequencing rules:
- **First company solo** to confirm the freshly hardened code path end-to-end. No parallelism in wave 1.
- **Pick the simplest company first** (1 number, 1 pipeline, 1 template, 1 lead source). This is the least likely to expose new bugs.
- Each wave runs a 5-lead canary. Caps stay at 30/day until the canary passes.
- Companies C + D may launch in parallel only if wave 2 completed cleanly with zero ops alerts.
- Hold company E until at least one earlier company has gone through its first inbound reply and end-of-day Slack digest path.

Between waves, verify:
- No new entries in `slack_event_queue` with `event_type='lead.dispatch_blocked'`.
- No `failed` rows added to `campaign_recipients` for the just-launched workspace.
- `system_heartbeats` for `lead-dispatch` is fresh (<2m).
- `numbers-health-sync` shows no `messaging_limit` regression on the launched numbers.

---

## 3. Per-company setup checklist

Do these in order. Stop at the first failure.

1. **Workspace**
   - Confirm a real workspace exists (not one of the empty `Main workspace` shells). If not, create one via `NewClientDialog`.
   - Set workspace owner = the operator account that holds the GBM/template assets.
2. **Pipeline**
   - Create one pipeline per intake source (usually one). Name: `<Company> / <Source> / <Geo>`.
   - Confirm default stages exist (`new chats`, etc., auto-seeded by `ensure_pipeline_stage`).
   - Mark as `is_default` if it is the only one.
3. **Worker access**
   - Invite operators via `invite-workspace-member`.
   - For non-managers: set `allowed_pipeline_ids` to this pipeline only (RLS scoping via `member_pipeline_scope`).
4. **Slack routing** (mandatory)
   - Set `pipelines.slack_channel_id` to a dedicated `client-<company>` channel (must exist, bot must be in it).
   - Send a test event from `slack-pipeline-digest` to confirm delivery before wave starts.
5. **Numbers**
   - Each number must be `status IN ('active','ready')` AND `is_active=true` AND `workspace_id` = this workspace.
   - Verify no number is already in another pipeline's `default_sender_number_ids` (P0 check #4).
   - Run `numbers-health-sync` once and confirm no `restricted/blocked`.
6. **Approved template**
   - Pick a template with `status='approved'` AND `whatsapp_number_id` matching one of the senders' apps.
   - Open template variables and confirm all `variables` are explicitly mapped from the lead source's payload (don't rely on first-name fallback for non-name fields).
7. **Source connection (lead intake)**
   - Configure the source (Google Sheets / webhook / Calendly) to push to `lead-intake` with the correct `pipeline_id`.
   - Push 1 test lead with a known phone (operator's own number). Confirm row appears in `lead_imports` with `status='pending'` and the right `pipeline_id`.
8. **First-touch settings**
   - `first_touch_template_id` set, `default_sender_number_ids` set, `sending_window` set in the company's local TZ, `daily_cap = 30 × len(senders)`.
   - **Leave `auto_outreach_enabled=false` until canary phase.**

---

## 4. Per-company smoke test (≤10 minutes)

Do this with 5 real test leads (operator-owned phones, friendly contacts).

1. **Lead intake** — push 5 leads. All 5 appear in `lead_imports` with `status='pending'` and correct `pipeline_id`. Payload fields visible.
2. **Pipeline routing** — flip `auto_outreach_enabled=true`. Within ≤2 min: rows transition `pending → queued`, each linked to a `campaign_recipients` row. `campaigns` row of `kind='first_touch'` is created and `status='running'`.
3. **First-touch sending** — within sending window, recipients flip `scheduled → sent`. Confirm Gupshup message ID is recorded; no `failed` rows.
4. **Inbox visibility** — for each sent message, a `conversations` row exists with `workspace_id` = this workspace, `pipeline_id` set, and `last_message_text` populated. CRM inbox shows them under the correct workspace filter.
5. **Pipeline board placement** — each conversation has a `deals` row in the first stage of the correct pipeline. Drag-drop works for the operator account.
6. **Slack notification** — `lead.dispatched` event in `slack_event_queue` is delivered to the company's Slack channel (not ops fallback). Format renders correctly.
7. **Worker visibility** — log in as a scoped operator. They see only this pipeline's deals/conversations; other workspaces are invisible.
8. **Reply path** — operator replies to one test lead from their phone. Inbound message appears, `lead_imports.status='replied'`, `unread_count` resets after operator replies back.
9. **End-of-day digest dry run** — trigger `slack-evening-digest` for this workspace; confirm summary lands in the company channel only.

A wave is "green" when all 9 pass with zero red flags. Then raise daily cap to target.

---

## 5. Safety / rollback plan

### Per-company kill switches (in order of blast radius, smallest first)
1. **Stop one number**: set `whatsapp_numbers.is_active=false`. `lead-dispatch` filters on this; `campaigns/index.ts` loop should skip it on next tick. No cross-pipeline impact.
2. **Stop one pipeline**: toggle `pipelines.auto_outreach_enabled=false` AND set all related `campaigns` of `kind='first_touch'` to `status='paused'`. New leads stay `pending`; in-flight queued recipients stop sending. (Needs the P0 admin button — see §6.)
3. **Stop one company**: pause every pipeline in the workspace using the same toggle. Optionally set every number in the workspace to `is_active=false` for a hard stop.
4. **Stop everything (global)**: there is no env-level kill switch; the fastest equivalent is to disable the `lead-dispatch` and `campaigns` cron schedules. Keep that runbook step printed and physically next to the operator.

### Per-company isolation rules (already in place but worth restating)
- One Slack channel per company → ops noise stays scoped.
- Per-pipeline daily cap → one company can't drain another's quota.
- RLS via `member_pipeline_scope` → operators can't accidentally touch another company.
- `lead_imports.pipeline_id` is immutable → a misrouted lead can't be silently re-homed.

### What must be easy to disable from the UI today
- `auto_outreach_enabled` toggle on each pipeline (already in `PipelineConfigSheet`).
- "Pause company" admin action that calls the P0 endpoint described below.
- `is_active` switch on each number in `NumbersInventory`.

---

## 6. P0 implementation plan (smallest set, do today)

Keep it tight. Five tiny changes; no refactors.

1. **"Pause pipeline" admin action.**
   - Single edge function `pipeline-pause` (POST `{pipeline_id, paused: bool}`). Service-role; checks caller is workspace manager/admin.
   - Effect: `UPDATE pipelines SET auto_outreach_enabled = NOT paused WHERE id=...` AND `UPDATE campaigns SET status = CASE WHEN paused THEN 'paused' ELSE 'running' END WHERE pipeline_id=... AND kind='first_touch' AND status IN ('running','paused')`.
   - Wire a button in `PipelineConfigSheet` (manager only) and in admin "OpsLive".

2. **Mandatory Slack channel guard.**
   - In `PipelineConfigSheet` "Go Live" path: block `auto_outreach_enabled=true` if `slack_channel_id IS NULL`. Show inline error.
   - Backstop in `lead-dispatch`: if `auto_outreach_enabled=true` AND `slack_channel_id IS NULL`, emit one `lead.dispatch_blocked` with reason `missing_slack_channel` and skip. (Safe — uses existing throttled pattern.)

3. **Sender-number uniqueness check.**
   - Add a DB function `assert_sender_numbers_unique(_pipeline_id uuid, _ids uuid[])` that raises if any id already appears in another pipeline's `default_sender_number_ids` where `auto_outreach_enabled=true`.
   - Call from the pipeline update path (frontend RPC + a `BEFORE UPDATE` trigger as belt-and-suspenders).

4. **Day-1 conservative cap default.**
   - When a pipeline is first toggled `auto_outreach_enabled=true` and `daily_cap IS NULL`, default it to `30 * coalesce(array_length(default_sender_number_ids,1),1)`. One-line guard in `PipelineConfigSheet` save handler. No migration needed.

5. **Empty-workspace cleanup.**
   - One-off script (or admin button) to delete the 8 unused `Main workspace` rows that have zero numbers, zero conversations, and zero non-default pipelines, owned by the same admin. Reduces operator misclick risk.

Explicitly out of scope today: webhook signature rework, RLS rewrites, per-number daily caps, template preflight UI, multi-region failover, retry budgets. Revisit after week 1.

---

## Operator runbook (one page, print this)

```text
GO LIVE (per company)
  1. Setup checklist §3 (1-8) green
  2. Smoke test §4 (1-9) green with 5 canary leads
  3. Raise daily_cap to target value
  4. Announce in #ops "Company X live, cap=N"

INCIDENT
  Single number bad     -> NumbersInventory: is_active=off
  Single pipeline bad   -> PipelineConfig: Pause Pipeline
  Whole company bad     -> Pause every pipeline in workspace
  Cross-company bad     -> Disable lead-dispatch + campaigns cron

VERIFY EVERY 30 MIN (today only)
  - slack_event_queue: 0 unprocessed >5min
  - system_heartbeats: lead-dispatch fresh <2min
  - campaign_recipients: no new failed rows in last 30m
  - numbers-health-sync: no new restricted/blocked
```
