# Audit: Pipeline Routing, Inbox, Visibility, Slack

Read-only investigation against the live database and code. All findings verified with queries.

## 1. Reproduction map

Trace for the 4 real Nitish leads currently in the system (workspace `b648d6a9...`, pipeline `28e660ae... = Nitish / Ads / India / Delivery`, default pipeline `a8fe7634... = Main`):

```text
Google Sheet (source_connection.pipeline_id = Nitish)
  -> POST /lead-intake
       lead_imports.pipeline_id  = Nitish  OK
       status=pending
  -> /lead-dispatch (cron)
       campaigns.pipeline_id     = Nitish  OK   (kind=first_touch)
       campaign_recipients row inserted (NO conversation_id yet)
       lead_imports.status       = queued
  -> /campaigns dispatcher (send tick)
       ensureCampaignConversation():
         INSERT conversations(...)  WITHOUT pipeline_id
         BEFORE INSERT trigger fill_conversation_pipeline_id
           sets pipeline_id = workspace DEFAULT = Main   <-- LOSS POINT 1
         AFTER INSERT trigger create_deal_for_new_conversation
           -> ensure_deal_for_conversation reads conv.pipeline_id (now Main)
           -> deals.pipeline_id     = Main               <-- LOSS POINT 2
           -> deals.stage_id        = first stage of Main pipeline
       UPDATE campaign_recipients SET conversation_id = ...
         AFTER UPDATE trigger propagate_campaign_pipeline_to_conversation
           UPDATE conversations SET pipeline_id = campaign.pipeline_id
                  WHERE pipeline_id IS NULL              <-- NEVER FIRES
                                                         (already filled to Main)
  -> Inbound reply via /whatsapp-webhook
       SELECT existing conversation -> already in Main, untouched
       Stage automation fires (button "Confirm request" -> "Positive reply")
         BUT target_stage_id belongs to Nitish pipeline
         -> resolveTargetStage() rebases to Main's "Positive reply" stage
       Auto-positive Slack alert:
         reads conv.pipeline_id (Main) and pipelines.slack_channel_id
         -> Main has no slack_channel_id -> falls back to workspace channel
         -> posts to ISKRA main channel                   <-- LOSS POINT 3
```

Verified data:

```text
lead_imports.pipeline_id    | conversations.pipeline_id | deals.pipeline_id
Nitish (28e660ae...)        | Main (a8fe7634...)        | Main (a8fe7634...)
```

The `enqueue_lead_first_reply_event` trigger (on `lead_imports.replied`) reads `lead_imports.pipeline_id`, which is Nitish, so its `slack_channel_id` is correct. But the auto-positive path (`whatsapp-webhook`) and the manual-star path read `conversations.pipeline_id`, which is wrong.

## 2. Pipeline routing audit

| Step | Sets `pipeline_id`? | Value | Verdict |
|------|---------------------|-------|---------|
| `source_connections` | configured | Nitish | OK |
| `import_batches` | from source | Nitish | OK |
| `lead_imports` | from source | Nitish | OK |
| `campaigns` (first_touch, lead-dispatch) | from pipeline arg | Nitish | OK |
| `campaign_recipients` | inherits via campaign | Nitish | OK |
| `conversations` (campaigns dispatcher) | NOT SET on insert -> trigger fills DEFAULT | Main | **WRONG** |
| `conversations` (whatsapp-webhook inbound) | NOT SET on insert -> trigger fills DEFAULT | Main | **WRONG** |
| `deals` (auto-create trigger) | reads conv.pipeline_id | Main | **WRONG (downstream)** |
| `pipeline_stages` selected for deal | first stage of Main | Main stage | **WRONG (downstream)** |

Root cause: two writers (`ensureCampaignConversation` in `supabase/functions/campaigns/index.ts` and the inbound branch in `supabase/functions/whatsapp-webhook/index.ts`) insert conversations without `pipeline_id`. The `fill_conversation_pipeline_id` BEFORE INSERT trigger then commits them to the workspace default. The repair trigger `propagate_campaign_pipeline_to_conversation` is gated on `pipeline_id IS NULL` and never overrides the wrong default. So this is a fallback-to-default + repair-trigger-too-late combination.

Why the cards appear in Main board: `Pipeline.tsx` filters `deals.eq('pipeline_id', selectedPipelineId)` and stages by `pipeline_id`. Deals are physically tied to Main, so the Nitish board is empty; the Main board shows them.

## 3. Inbox filter audit

Number filter chips render `friendlySenderLabel(n)` (`src/lib/crmData.ts:12`):

```ts
label?.trim() || `+phone_number`
```

Operations sees "01Ashik02" / "01Kartik01" because `whatsapp_numbers.label` was populated with the internal Gupshup app handle, not the operator name. Verified:

```text
phone_number  display_name      label
15177989269   Sadya             01Ashik02
14175001213   Kartik Chauhan    01Kartik01
16293360541   Kartik Chauhan    01Kartik02
918431218507  Kartik Chauhan    KartikKChauNum3
```

The right operational label is `display_name` (operator/profile) with `+phone_number` as the secondary line, and `label` should be hidden in the chat UI (it's a fleet/admin field).

Pipeline filter in Inbox (`CRM.tsx:398-401`) is a strict client-side equality on `c.pipeline_id`. It is technically correct; it shows nothing for the Nitish filter because the underlying conversations carry the wrong pipeline_id (same root cause as Section 2). "All pipelines" is also misleading because the Nitish conversations show up grouped with Main.

## 4. Access / visibility audit

Workspace member configuration:

```text
user_id 755912a7... = Nitish Sehrawat, role=manager,
allowed_pipeline_ids = {Nitish}
```

RLS on `conversations`, `messages`, `deals`, `campaign_recipients`, `pipeline_stages` is gated by `can_access_pipeline(workspace, user, pipeline_id)`. Because the leads' conversations and deals were physically committed to Main, `can_access_pipeline` returns false for Nitish. Result: Nitish literally cannot see those conversations, messages, or deals from any view (Inbox, Pipeline, overview). Owner/admin sees them in Main.

Visibility code itself is consistent across views; the data is in the wrong pipeline. There is no separate UI bug to fix beyond the pipeline_id correction.

## 5. Slack routing audit

Three paths exist:

1. **`lead.first_reply`** (DB trigger `enqueue_lead_first_reply_event` on `lead_imports`)
   - Reads `pipelines.slack_channel_id` from `lead_imports.pipeline_id` = Nitish.
   - Routing in `slack-dispatch` falls back to workspace channel only if pipeline channel is null.
   - **OK** for first-reply alerts.

2. **`positive_lead` (auto)** in `whatsapp-webhook`
   - Reads `conversations.pipeline_id` (currently Main).
   - Looks up `pipelines.slack_channel_id` for Main = NULL.
   - In `slack-dispatch`, `pipelineChannel = payload.slack_channel_id || workspaceChannel` -> falls back to workspace ISKRA channel.
   - Verified queue row: `event_type=positive_lead, status=sent, pipeline=a8fe7634(Main), slack_channel_id=NULL` posted to workspace channel.
   - **WRONG** because of the wrong pipeline_id, not because of the routing code.

3. **`positive_lead` (manual star)** - the trigger has been removed in the prior session. Not a current source.

4. **`lead.imported / lead.import_failed / lead.dispatched / lead.dispatch_blocked`** - silently `skipped` in slack-dispatch. **OK** per prior decision.

Net: Slack code correctly prefers the pipeline channel. The reason it landed in Iskra main is the upstream pipeline_id corruption, not Slack-side logic.

## 6. Multi-user sync audit

- Realtime publication includes `conversations`, `messages`, `deals`, `campaigns`, `campaign_recipients`. OK.
- `Pipeline.tsx` and `CRM.tsx` subscribe at workspace scope and let RLS gate which rows arrive. OK.
- `messages.sent_by_user_id` is written in `send-whatsapp` and surfaced as "by Nitish Sehrawat" in `CRM.tsx`. OK.
- `conversations.active_responder_id/at` is updated on chat open/send via `touchResponder`. OK.

The only sync issue today: scoped users (Nitish) never receive realtime payloads for the affected conversations because RLS rejects rows with the wrong pipeline. Once pipeline_id is correct, realtime sync will start working without code changes.

There is no separate stale-state or cross-pipeline desync in client filtering.

## 7. Root-cause summary (prioritized)

- **P0-A** Conversations are inserted without `pipeline_id`, the BEFORE INSERT trigger forces them into the workspace default ("Main"), and the repair trigger is gated on `IS NULL` so it never overrides. This is the single root cause behind: empty Nitish board, deals appearing in Main, Nitish (scoped manager) being unable to see anything in Inbox/Pipeline/overview, and the positive-reply Slack alert landing in the Iskra main channel.
- **P0-B** Existing 4 leads in production carry the wrong `pipeline_id` on `conversations`, `deals`, `deals.stage_id`. They will not auto-heal even after P0-A is fixed. They must be backfilled.
- **P1-A** `friendlySenderLabel` exposes the technical `label` ("01Ashik02") in the Inbox number filter. Should display operator-friendly name (`display_name`) with phone, and treat `label` as fleet/admin metadata only.
- **P1-B** Auto-positive logic in `whatsapp-webhook` resolves the pipeline channel from `conversations.pipeline_id`. Even after P0-A, prefer the campaign's `pipeline_id` when an inbound is linked to a campaign recipient (more authoritative than the conversation column).
- **P2-A** `propagate_campaign_pipeline_to_conversation` should overwrite the conversation's `pipeline_id` when it disagrees with the campaign's, not only when NULL. Defence-in-depth so a future regression of P0-A self-corrects.
- **P2-B** Add an integrity check (read-only): a small admin query / nightly log when a conversation's `pipeline_id` differs from its linked first_touch campaign's `pipeline_id`.
- **P2-C** `display_name` of `whatsapp_numbers` is currently used as the operator/seller name (Sadya, Kartik). Document that `label` is internal-only; consider renaming the column or hiding it from non-admin UIs.

## 8. Fix plan (smallest safe sequence)

### P0 - blockers, must ship before any new traffic

1. **Stop committing the wrong pipeline_id at the source.**
   - In `supabase/functions/campaigns/index.ts` `ensureCampaignConversation`: pass `pipeline_id` from the campaign (already in scope via `recipient.campaigns`) when inserting the conversation.
   - In `supabase/functions/whatsapp-webhook/index.ts` inbound branch: when creating a new conversation, look up the most recent first_touch `campaign_recipients` row for `(whatsapp_number_id, contact_phone)`, take its campaign's `pipeline_id`, and insert with it. Fallback: leave NULL so the trigger uses workspace default (current behaviour).

2. **Backfill the 4 existing leads.** Single migration that, for each `lead_imports` row with status in (queued, sent, replied) and a non-null `conversation_id`:
   - `UPDATE conversations SET pipeline_id = lead_imports.pipeline_id` where they differ.
   - `UPDATE deals SET pipeline_id = lead_imports.pipeline_id` for the linked conversation.
   - `UPDATE deals SET stage_id =` first stage of the correct pipeline, where the current stage is in the wrong pipeline.

3. **Resend the missed positive_lead Slack alert** for Priyanshu Kumar (lead `4ae94204...`, currently `replied`) into the Nitish channel `C0B2DBG8D0X`. One-shot insert into `slack_event_queue` with the right `slack_channel_id`.

### P1 - UX corrections

4. Change `friendlySenderLabel` to: `display_name?.trim() || +phone_number`. Drop the `label` branch entirely from chat-facing components (keep it in `FleetRegistry`/admin only). One file: `src/lib/crmData.ts`.

5. In `whatsapp-webhook` auto-positive block: resolve `slack_channel_id` from the campaign's pipeline first, then fall back to `conversations.pipeline_id`. Belt-and-braces in case P0-A misses an edge case.

### P2 - hardening

6. Tighten `propagate_campaign_pipeline_to_conversation` to overwrite when the conversation's pipeline does not match the campaign's (drop the `IS NULL` guard, but only when campaign `kind = 'first_touch'`).

7. Add a nightly read-only check (or surface a row in admin) listing conversations whose `pipeline_id` disagrees with the linked first_touch campaign. Pure observability.

8. Mark `whatsapp_numbers.label` as admin-only in UI components; add a comment in `crmData.ts` describing the field semantics.

No greenfield rework, no schema redesign. The whole P0 sequence is two edge-function edits, one data-fix migration, and one Slack replay insert.