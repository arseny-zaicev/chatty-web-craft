# Multi-Pipeline CRM — Permanent Operating Model

## 1. Product model

**A pipeline is the unit of operational work.** It owns: a set of stages, a default sender number set, an optional lead source, an optional team scope, and a set of access rules. Conversations, deals, campaigns, and stats are always scoped to exactly one pipeline. Workspaces are billing/branding containers; pipelines are how work actually gets done.

**Already sufficient:**
- `pipelines` + `pipeline_stages` per workspace, default flag, manual naming
- `conversations.pipeline_id`, `deals.pipeline_id`, `campaigns.pipeline_id` with auto-fill triggers and propagation
- Pipeline selectors in Launch Wizard, Inbox filter, move-between-pipelines
- `workspace_members.allowed_pipeline_ids` + RLS hiding inaccessible rows
- Invite links carry pipeline scope

**Still missing for the permanent model:**
- Concept of a **lead source** attached to a pipeline (manual is the default; external is opt-in)
- Concept of an **import batch** so leads keep their provenance
- Per-pipeline **default outreach config** (sender numbers, first-message template, timing window)
- Per-pipeline **Slack routing** for events
- Per-pipeline analytics view
- Restricted-access for non-client roles (today scoping is conceptually client-only)

---

## 2. Access model

Keep four roles, decouple role from scope:

| Role | Default scope | Can scope-restrict? | Notes |
|---|---|---|---|
| owner | all pipelines | no | workspace creator |
| manager | all pipelines | **yes** (new) | day-to-day ops lead; may legitimately own only one pipeline |
| agent (new, optional) | scoped only | yes (required) | works inbox + can edit deals; no settings |
| client | scoped only | yes (required) | read/limited write; stats gated by `can_view_stats` |

`allowed_pipeline_ids` becomes the single scoping mechanism for any non-owner role. Helpers `member_pipeline_scope` / `can_access_pipeline` already work; just stop short-circuiting them for managers when the array is non-empty.

**Visibility everywhere is RLS-driven, not UI-driven:**
- Inbox: only conversations in allowed pipelines
- Pipeline page: only allowed boards in the tab strip; default-fallback picks first allowed
- Campaigns: only campaigns whose `pipeline_id` is allowed
- Stats / Overview: aggregates already filtered by RLS, plus an explicit "scope: pipelines X, Y" badge in the header so users understand what they're seeing

Agent role can be deferred to P1 if managers + clients cover ISKRA day-1.

---

## 3. External source model

Model as a **source connection attached to a pipeline**, not a pipeline type. A pipeline is "manual" until a source is attached; attaching one makes it "externally fed". Multiple sources per pipeline allowed; one source feeds exactly one pipeline.

```text
pipeline ──< pipeline_source >── source_connection
                                   ├── kind: google_sheet | webhook | csv_upload | apps_script | api
                                   ├── config jsonb (sheet id, webhook secret, mapping, ...)
                                   └── status: active | paused | error
```

Google Sheets / Apps Script is just `kind = google_sheet` (or `apps_script`). Webhook is the generic escape hatch — any external system can POST to `/functions/v1/lead-intake?token=...` and land in the right pipeline. CSV upload is the manual fallback.

**Every imported lead carries:**
- `source_connection_id`, `import_batch_id`, `external_id` (dedupe key from source), `external_payload` jsonb (raw row), `imported_at`, `imported_by` (system or user), `pipeline_id`

This metadata lives on a single `lead_imports` table that joins to the conversation/deal it produced.

---

## 4. Lead routing

1. Source pushes/pulls rows → `lead_imports` row created (status `pending`)
2. Validator normalises phone, dedupes against existing conversations in the same workspace+pipeline
3. On accept → create or attach to a conversation in the source's pipeline, create deal in first stage, mark batch row `routed`, emit `lead.imported` event
4. If the pipeline has `auto_outreach_enabled`, enqueue the configured first-message campaign-of-one against that conversation
5. Replies land via existing webhook; because conversation already has `pipeline_id`, deal/campaign stay attached automatically (existing triggers handle this)

Batch is a first-class object so a manager can see "23 leads imported from Sheet X at 10:14, 21 contacted, 4 positive". Ownership defaults to the pipeline's assigned manager, overridable per batch.

---

## 5. Messaging flow

Three configuration layers, narrowest wins:

| Layer | Configures | Example |
|---|---|---|
| Workspace | brand voice, fallback sender pool | global defaults |
| **Pipeline** | default sender numbers, default first-touch template, sending window, daily cap, auto-outreach on/off | "Hot Leads UK" sends within 5 min, 09–20 UK time |
| Source / Campaign | overrides for that batch (template variant, A/B, delay) | a specific Sheet uses template v2 |

Hot-lead pipelines = `auto_outreach_enabled = true` + a "first-touch" template + a short delay (e.g. 60s). Every imported lead spawns a single-recipient campaign so all the existing campaign machinery (retries, throttling, stats, Slack) is reused. Fallback when no template/sender available: lead lands in pipeline with status `awaiting_manual` and triggers a Slack alert.

---

## 6. Slack notifications

Event types (all already partly scaffolded via `slack_event_queue`):

- `lead.imported` (batch-level summary, not per row)
- `lead.import_failed` (validation/source error)
- `conversation.positive_reply` (exists)
- `conversation.no_reply_24h` / `48h` (new, scheduled job)
- `pipeline.backlog_high` (e.g. >N unhandled positives)
- `campaign.*` (exist)
- `number.*` (exist)

**Routing:** per-pipeline Slack channel override, falling back to workspace default, falling back to the existing global ops channels. Source-level routing is unnecessary in MVP — the pipeline already implies the team.

---

## 7. Analytics

**Per pipeline (every pipeline gets these):**
- conversations active, won, lost (already derivable from stages)
- messages sent / delivered / replied
- positive reply rate
- median first reply time (contact → first inbound)
- median manager response time (inbound → first agent message)

**Additional for externally-fed pipelines:**
- leads imported (by batch & source)
- import → first-touch latency
- no-reply-after-24h / 48h counts
- conversion: imported → contacted → replied → positive → won

All of these are SQL views over existing tables once `lead_imports` and `import_batches` exist. Surface as a "Pipeline analytics" tab on the Overview page, defaulting to current pipeline.

---

## 8. Data model — minimal additions

```text
source_connections        (id, workspace_id, pipeline_id, kind, name, config jsonb, status, secret_token, created_by, ...)
import_batches            (id, source_connection_id, pipeline_id, workspace_id, started_at, finished_at, total, accepted, rejected, status, error)
lead_imports              (id, batch_id, pipeline_id, workspace_id, external_id, phone, name, payload jsonb, conversation_id, deal_id, status, imported_at)
                          unique (source_connection_id, external_id)
pipeline_settings         add columns to pipelines: auto_outreach_enabled bool, first_touch_template_id uuid, sending_window jsonb,
                          default_sender_number_ids uuid[], slack_channel_id text, daily_cap int
```

Roles/scoping: **no schema change** — reuse `workspace_members.allowed_pipeline_ids` for managers/agents too; just add `'agent'` to the role enum when that role ships.

RLS on the new tables mirrors `conversations`: workspace member + `can_access_pipeline()`.

---

## 9. UI / UX

**Settings → Pipelines** (per row):
- Name, color, default flag (exists)
- "Sources" sub-section: list of connected sources with status; "Connect source" button → modal with kind picker (Google Sheet, Webhook URL, CSV, later API)
- "Outreach" sub-section: auto-outreach toggle, first-touch template, sender numbers, sending window, daily cap
- "Notifications" sub-section: Slack channel override
- "Access" sub-section: list of members with access (read-only summary; editing stays in Team settings)
- A pill on the pipeline header showing **Manual** or **Externally fed · Google Sheet**

**Team settings:** extend the existing pipeline-scope picker to managers and (later) agents — same UI, same `update_access` action.

**Scoped users:** if a user has access to only some pipelines, show a subtle banner "You see data for: Hot Leads UK, Outbound DE" on Inbox/Overview so the empty/partial state is never confusing.

**Source connect flow:** webhook returns a copy-paste URL + secret token; Google Sheet asks for sheet id + column mapping; CSV is a one-shot upload that creates a batch and is done.

---

## 10. MVP scope

**P0 — must-have for the permanent model**
- `source_connections`, `import_batches`, `lead_imports` tables + RLS
- Generic `lead-intake` webhook edge function (one universal endpoint, token-auth, validates + dedupes + routes)
- Pipeline columns: `auto_outreach_enabled`, `first_touch_template_id`, `default_sender_number_ids`, `slack_channel_id`
- Settings → Pipelines: Sources + Outreach + Notifications sub-sections
- Auto first-touch: imported lead → single-recipient campaign reusing existing campaign engine
- Slack: `lead.imported` (batch summary) + `lead.import_failed`, route via pipeline override
- Analytics: per-pipeline view with the 5 base metrics + imported/contacted/replied funnel
- Manager scoping: allow non-empty `allowed_pipeline_ids` for managers (no enum change yet)

**P1 — useful next**
- Google Sheets source kind (uses existing `google-sheets` function)
- CSV upload source kind
- Agent role (enum addition + minor UI)
- `no_reply_24h/48h` scheduled job + Slack
- Pipeline backlog alert
- Per-pipeline daily cap enforcement in scheduler

**P2 — later**
- Apps Script template repo (documented, not core)
- Per-source A/B template variants
- Public REST API for source pushes (versioned)
- Per-stage automations (already partly scaffolded via StageAutomationsDialog)
- Cross-pipeline reporting & cohort analytics

---

## 11. Fastest safe path

**For ISKRA tomorrow (1–2 day path):**
1. Add the three tables + pipeline columns in one migration
2. Ship the generic `lead-intake` webhook (no Sheets-specific code) — ISKRA's Apps Script POSTs to it
3. Add Sources + Outreach sub-sections to Settings → Pipelines (UI only over the new columns/tables)
4. Wire auto first-touch by enqueuing a single-recipient campaign through existing campaign code — no new sender path
5. Add `lead.imported` Slack event reusing `slack_event_queue`
6. Skip agent role, skip 24/48h jobs, skip Sheets-specific UI, skip analytics tab (numbers can be read from existing campaign stats for the demo)

**For the reusable product (do differently):**
- Treat the webhook as the canonical contract; Sheets/Apps Script is documentation, not code in the repo
- Don't bake any client-specific column mapping into the function — mapping lives in `source_connections.config`
- Make every per-pipeline setting nullable with a workspace-level fallback so new clients work with zero config
- Build the analytics view as SQL views from day one so dashboards can be added later without backfills
- Ship manager scoping in P0 even if unused, so the access model is uniform before more clients onboard

---

## Constraints honoured
- Google Apps Script is one optional `source_connections.kind`, never referenced in core code paths
- Access control stays on `allowed_pipeline_ids`; pipeline names remain free-form labels
- No re-planning of already-shipped pieces (pipeline CRUD, invite scoping, RLS, move actions)
- No speculative integrations — webhook + CSV + Sheets cover all near-term needs
