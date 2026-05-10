
# First-touch outreach for imported leads

Goal: turn `lead_imports` rows with `status = pending` into real outbound first-touch messages by reusing the existing campaigns engine, without inventing a parallel sender.

## 1. Recommended execution model

**One rolling "first-touch" campaign per pipeline.** Not per batch (too noisy in Slack and stats), not per source (a pipeline can have several sources, but the first-touch behaviour is owned by the pipeline).

- Each pipeline with `auto_outreach_enabled = true` has at most one **active rolling campaign** at any given time, named e.g. `First touch · <Pipeline name>`.
- Newly accepted `lead_imports` are appended to that campaign as additional `campaign_recipients` rows with their own `scheduled_at` inside the pipeline's window.
- The campaign keeps `status = running` indefinitely. We rotate it (close + open new one) once per UTC day, so daily stats, Slack noise and the campaigns list stay readable.
- Sibling-by-number is handled the same way the existing engine already groups (`name :: numberLabel`); when a pipeline has multiple sender numbers we open one sibling per number and round-robin recipients across them.

Why this model:
- Zero new sender code. The existing dispatcher (`campaigns` function + `campaign_recipients` table + cron tick) already handles window, scheduling, Gupshup call, conversation linking, Slack `campaign_*` events, retries.
- One row per recipient = exact same "stop", "skip", "failed" semantics as bulk launches.
- Pipeline-level campaign is the natural unit for stats/throttling.

**Safe entry path** for an imported lead:

1. `lead-intake` validates and writes `lead_imports.status = 'pending'` (already does this).
2. A small worker (`lead-dispatch`, see below) picks pending rows, ensures the rolling campaign exists, inserts `campaign_recipients` rows with computed `scheduled_at`, flips `lead_imports.status = 'queued'` and stores `campaign_id` + `campaign_recipient_id`.
3. From here the existing campaigns dispatcher owns the lead.

The webhook itself never calls the sender. This keeps intake fast, idempotent, and isolated from outbound failures.

## 2. Job flow

Two cron jobs, both pg_cron → edge function:

- **`lead-dispatch`** every minute. Claims `lead_imports` where `status = 'pending'` and `auto_outreach_enabled = true` on the pipeline, in workspace+pipeline batches of ≤ 200, with `FOR UPDATE SKIP LOCKED`. Per pipeline:
  1. Resolve config: template, sender numbers, window, daily cap, timezone.
  2. Compute remaining capacity for today (see §5).
  3. Get-or-create today's rolling campaign (siblings per sender number).
  4. Compute `scheduled_at` for each lead inside the next available window slot, with poisson spacing identical to existing logic (so we don't re-implement scheduling math; ideally extract the helper from `campaigns/index.ts` into `_shared/schedule.ts`).
  5. Insert `campaign_recipients`, update `lead_imports` (`queued`, `campaign_id`, `campaign_recipient_id`, `scheduled_at`), bump batch counters.
  6. Anything that didn't fit today stays `pending` and is retried tomorrow.
- **`campaigns` dispatcher tick** (already exists). Continues to send according to `scheduled_at`. We just hook into its outcome by:
  - DB trigger on `campaign_recipients.status` change → mirror to `lead_imports.status` (`sent` / `failed` / `skipped`) and capture `sent_at` / `error`.

Per-row state machine handled by these jobs:

| campaign_recipient event | lead_imports transition |
|---|---|
| inserted by `lead-dispatch` | pending → queued |
| dispatcher sends OK | queued → sent (+ `sent_at`, `conversation_id`) |
| dispatcher errors | queued → failed (+ `error`) |
| recipient marked skipped (dedup, do-not-contact) | queued → skipped |
| inbound reply on the conversation | sent → replied (set by webhook trigger, see §4) |

No row goes back to `pending` once queued. Failed leads can be requeued manually from the operator UI later (out of scope for P0).

## 3. Data lifecycle

`lead_imports.status` enum, in order:

- `pending` — accepted by webhook, not yet routed. Default for auto-outreach pipelines.
- `awaiting_manual` — accepted but pipeline has `auto_outreach_enabled = false`. Lives in operator backlog. Never picked up by `lead-dispatch`.
- `queued` — `lead-dispatch` placed it in a campaign, has `campaign_id`, `campaign_recipient_id`, `scheduled_at`.
- `sent` — first message went out. Has `sent_at`, `conversation_id`.
- `replied` — contact replied at least once. Set from webhook.
- `failed` — Gupshup error, template rejected, number blocked. Has `error`.
- `skipped` — duplicate detected late, do-not-contact, capacity-exhausted-and-expired (see §5).
- `invalid` — set by webhook on bad phone (already implemented).
- `duplicate` — set by webhook on contact dedupe (already implemented).

Allowed transitions (everything else is illegal and rejected by a guard trigger):
```
pending  → queued | skipped | invalid
queued   → sent | failed | skipped
sent     → replied
```

`import_batches` aggregates derived from its rows:

- `total`, `accepted`, `rejected` — set by webhook (already done).
- `queued_count`, `sent_count`, `failed_count`, `replied_count` — maintained by trigger on `lead_imports`.
- `status`:
  - `processing` while webhook is iterating
  - `completed` once webhook closes (already done)
  - `dispatching` while at least one row is `pending`/`queued`
  - `done` when all rows are terminal (`sent`/`replied`/`failed`/`skipped`/`invalid`/`duplicate`)
  - `failed` if all accepted rows ended `failed`

These are observability fields, not control flow — `lead-dispatch` queries `lead_imports` directly.

## 4. Routing guarantees

The invariant: every conversation, deal and message belongs to exactly the pipeline of the source that imported the lead.

- `lead_imports.pipeline_id` is set by the webhook (already done) and is **immutable** (add a guard trigger).
- When `lead-dispatch` creates the rolling campaign, it sets `campaigns.pipeline_id = lead_imports.pipeline_id`. The existing `propagate_campaign_pipeline_to_conversation` trigger then stamps the conversation, and `sync_deal_pipeline_from_stage` keeps the deal aligned.
- The send path (`send-whatsapp` → conversation upsert) must also pass `pipeline_id`. Today the conversation gets `pipeline_id` filled by the `fill_conversation_pipeline_id` trigger from workspace default — that's wrong for multi-pipeline workspaces. Fix: when the dispatcher creates/updates the conversation, set `pipeline_id` from the campaign explicitly.
- Reply webhook: when an inbound message arrives, look up the conversation; if it has a `pipeline_id`, do nothing. If it doesn't (manual contact), leave it for the workspace default. Either way, replies inherit, never override.
- Add a check trigger: `conversations.pipeline_id` may only change via `moveConversationToPipeline` (the operator action). Background jobs cannot mutate it after creation.

Result: a lead from "Hot Leads UK" pipeline can never surface in "Outbound DE" stats or inbox, no matter how the message round-trips.

## 5. Rate limiting and safety

All limits live on `pipelines` (already added: `sending_window`, `daily_cap`, `default_sender_number_ids`).

- **Sending window**: passed straight into `campaign_recipients.scheduled_at` computation (reuse the existing helper). If "now + spacing" would land outside `[window_start, window_end]` in the workspace TZ, roll to the next day's `window_start`. Same logic the campaigns engine already uses.
- **Daily cap** (per pipeline, per UTC day):
  - Before queueing, count `lead_imports` with `status IN ('queued','sent','replied','failed')` where `scheduled_at::date = today` for that pipeline.
  - Available = `daily_cap - used`. Queue only that many. Leftovers stay `pending`.
  - Per-number cap inherited from the existing dispatcher's per-number throttling — we don't duplicate it.
- **Sender selection**: from `pipelines.default_sender_number_ids`. Filter to numbers in `status = 'active'` and not over per-number daily cap. Round-robin across the survivors. If empty after filtering, do not queue; emit `lead.dispatch_blocked` Slack event (see §6) and leave rows `pending`.
- **Capacity exhausted**: pending rows that have been waiting > 72h get marked `skipped` with reason `expired` so they don't pile up forever. Operator can re-import.

Backpressure: `lead-dispatch` processes at most N pipelines per tick; if a pipeline has > 500 pending leads, it processes 500 and lets the next tick handle the rest. This protects pg_cron from long-running ticks.

## 6. Slack events

Reuse `slack_event_queue`. New event types to emit:

- `lead.imported` (already done) — batch summary on webhook close.
- `lead.import_failed` (already done) — webhook rejected everything.
- `lead.dispatched` — `lead-dispatch` queued ≥ 1 lead. Aggregated per pipeline per tick (one Slack message per pipeline, not per lead).
- `lead.dispatch_blocked` — pipeline has pending leads but no sendable number / cap exhausted / template missing. Throttled to once per pipeline per hour.
- `lead.first_touch_failed` — first-touch send failed for a lead. Aggregated: one summary per pipeline per 15 min, with count + sample errors.
- `lead.first_reply` — first inbound reply on a lead that came from an external source. Useful signal for hot pipelines.

`campaign_*` events from the rolling campaign should be **suppressed** for first-touch campaigns (filter by name prefix or a new `campaigns.kind = 'first_touch'` column) — otherwise we'd Slack-spam every day's rotation.

Pipeline's `slack_channel_id` overrides workspace default for all of the above.

## 7. MVP scope

**P0 — must have**
- New columns: `lead_imports.campaign_id`, `lead_imports.campaign_recipient_id`, `lead_imports.scheduled_at`, `lead_imports.sent_at`, `lead_imports.conversation_id`, `lead_imports.error`.
- New column: `campaigns.kind` (`'manual' | 'first_touch'`), default `'manual'`.
- Status guard trigger on `lead_imports`.
- `lead-dispatch` edge function + 1-minute pg_cron schedule.
- Reuse `campaigns` dispatcher unchanged.
- Trigger: mirror `campaign_recipients.status` → `lead_imports.status`.
- Fix conversation `pipeline_id` propagation from first-touch campaign.
- Slack: `lead.dispatched`, `lead.dispatch_blocked`, `lead.first_touch_failed`. Suppress `campaign_*` for `kind = 'first_touch'`.
- Operator UI: pipeline config shows live counters (pending / queued / sent today) so we can see the worker is alive.

**P1 — useful next**
- `import_batches` derived counters + `dispatching`/`done` status.
- `lead.first_reply` event.
- Operator action "requeue failed leads" + "stop auto-outreach for this batch".
- Per-number capacity awareness in `lead-dispatch` (today we trust the campaigns dispatcher to throttle).
- Expire stale `pending` rows after 72h.

**P2 — later**
- Per-source first-touch override (template / window) on top of pipeline defaults.
- A/B template split per source.
- Multi-step sequences (follow-ups) — same engine, just chained.

**Risks / edge cases**
- **Race between webhook dedupe and dispatch dedupe**: same phone arrives in two near-simultaneous batches. Webhook check catches the second one; if both pass, `campaign_recipients` unique-on-phone-per-pipeline (add this index) catches it at queue time → mark second one `duplicate`.
- **Template not approved**: pipeline says `auto_outreach_enabled = true` but `first_touch_template_id` is null or template is not `approved`. `lead-dispatch` must guard and emit `dispatch_blocked`, never queue with no template.
- **Pipeline reassignment after queue**: operator moves conversation to another pipeline mid-flight. Allowed. The first-touch send still goes out via the original pipeline's number (already queued); subsequent stats follow the new pipeline. Document this.
- **Daily cap changes mid-day**: cap lowered below already-queued count. Don't unqueue — only future queueing respects the new cap.
- **pg_cron drift**: `lead-dispatch` must be idempotent (claim with `SKIP LOCKED`, status transitions guarded).
- **Time-zone window**: workspace TZ vs recipient TZ. For first-touch we use workspace TZ only (recipient TZ is unknown for fresh imports). Document.
- **Slack channel missing scope**: pipeline points at a private channel the bot isn't in. `slack-dispatch` already logs this; we just need to surface it once in the UI.

## Technical appendix

```text
external system
      │ POST /functions/lead-intake (x-source-token)
      ▼
┌──────────────────┐
│ lead-intake (✓)  │  validates, dedupes, writes lead_imports.status='pending'
└──────────────────┘
      │ (every minute, pg_cron)
      ▼
┌──────────────────┐
│ lead-dispatch    │  per pipeline:
│  (new)           │   - read config
│                  │   - compute capacity & schedule
│                  │   - upsert today's first_touch campaign
│                  │   - insert campaign_recipients
│                  │   - flip lead_imports → queued
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ campaigns tick   │  existing dispatcher; sends via send-whatsapp
│  (unchanged)     │  updates campaign_recipients.status
└──────────────────┘
      │ (trigger)
      ▼
   lead_imports.status mirrors → sent | failed | skipped
      │ (whatsapp-webhook on inbound)
      ▼
   lead_imports.status → replied
```

Reusable scheduling helper to extract from `campaigns/index.ts` into `_shared/schedule.ts` so `lead-dispatch` doesn't fork the math:
- `hhmmToMin`, `dateAtTzToUTC`, poisson spacing, window-rollover.

DB additions:
- `campaign_recipients` unique partial index `(campaign_id, contact_phone)` — catch dedup races.
- `lead_imports` index on `(status, pipeline_id)` for `lead-dispatch` claim queries.
- Status-guard trigger on `lead_imports` enforcing the transition table in §3.
