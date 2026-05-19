## Goal

Make the 2-client setup (2 Sheets → 2 Pipelines → shared 3-number pool → first-touch + follow-up) deliver reliably. Below I separate what already exists in this repo from what still needs to be built, with the 3 clarifications you asked for.

---

## A. Issue classification

| # | Area | Class |
|---|---|---|
| 1 | Wrong source/pipeline routing | Bug (workspace-wide dedupe is too wide) |
| 2 | Shared sender pool + per-number template variants | Backend works; **operator UI is incomplete** |
| 3 | Phone normalization | Missing capability + data quality (2 inconsistent copies today) |
| 4 | Follow-up curfew + template enforcement | Backend exists; **runtime needs verification**, visibility + silent-failure are gaps |

---

## B. What ALREADY exists in the repo (do not rebuild)

**Schema / DB**
- `source_connections (pipeline_id, kind='google_sheet', config jsonb, secret_token)` — each source is hard-wired to exactly one pipeline.
- `pipelines.default_sender_number_ids uuid[]` — both pipelines can list the same 3 numbers.
- `pipelines.first_touch_template_group_id`, `follow_up_template_group_id` — FKs to `template_groups`.
- `template_groups (template_names text[])` — one logical group, multiple per-sender variant names.
- `pipelines.follow_up_enabled / follow_up_delay_minutes (480) / follow_up_curfew_end (20:00) / follow_up_resume_at (09:00) / follow_up_timezone ('Europe/Berlin')`.
- DB function `public.pipeline_follow_up_send_at(pipeline_id, base_ts)` — computes the next-allowed local-time slot, DST-safe via `AT TIME ZONE`.
- Triggers: `schedule_follow_up_on_first_touch_sent`, `cancel_follow_up_on_inbound`, `cancel_follow_up_on_stage_change`.

**Backend**
- `lead-dispatch` — resolves per-sender variants from a template group, silent-skips senders missing an approved variant, round-robins recipients, logs `sender_skipped` to `campaign_dispatch_events`.
- `follow-up-dispatch` — reads due `pipeline_follow_ups` rows, resolves per-sender variant, creates per-day per-number follow-up campaign, cancels with `cancelled_reason` when sender lacks an approved variant or is unavailable.
- `google-sheets-sync` — has its own inline `normalizePhone()` (length 7–10 + defaultCC).
- `lead-intake` — has its **own** copy of `normalizePhone()`.

**Frontend**
- `PipelineConfigSheet.tsx` — operator can pick a template group for first-touch and follow-up.

---

## C. What does NOT exist yet (real work)

**Backend**
- No `_shared/phone.ts` helper. The two `normalizePhone()` copies drift and neither handles trunk-zero or an `ambiguous` outcome, and neither preserves the raw value.
- `google-sheets-sync` dedupes lead_imports **workspace-wide** by phone — leaks across pipelines.
- `google-sheets-sync` returns only `total/accepted/rejected`. No `normalized/invalid/ambiguous/duplicate/skipped_test_lead` split.
- `follow-up-dispatch` cancels with a reason but does **not** emit a Slack notice — operator never sees blocked follow-ups.

**Frontend / operator UI**
- `PipelineConfigSheet` has **no** sender × variant matrix. After picking a template group there is no visible mapping of `which sender uses which approved variant`. Operators cannot verify wiring.
- No "Connected sources" list per pipeline.
- No read-only banner of `timezone / curfew / resume / delay` for follow-up.
- No labelled "Default country code" field on the Sheet source editor (today it lives in raw JSON).
- `WorkspaceData.tsx` does not show extended import counts.

---

## D. The 3 clarifications

### D1. Canonical phone storage format — decision: **digits-only E.164** (no leading `+`)

**Why:** the existing codebase (`google-sheets-sync`, `lead-intake`, `conversations.contact_phone`, `campaign_recipients.contact_phone`, `whatsapp_message_events`, Gupshup webhook handlers, the in-app inbox) already stores and matches on digits-only E.164. Adding `+` now would break every existing equality lookup and dedupe path. Switching to `+E.164` would be a separate, larger migration.

**Rule, applied everywhere the helper is used:**
- Storage format on `lead_imports.phone`, `conversations.contact_phone`, `campaign_recipients.contact_phone`: **digits only, no `+`, no spaces, length 8–15** (E.164 max is 15 digits).
- Display format in UI: `+<digits>` (prefix added at render time). The new `senderFullLabel` already does this.
- Raw value: always preserved in `lead_imports.payload._phone_raw` for audit.
- Examples (the user's): `4917630349501` → kept; `41766496279` → kept; `4366488243202` → kept; `01512xxxxxxx` with `defaultCC=49` → `4915xxxxxxx`; `+49 176 30349501` → `4917630349501`.

### D2. Same phone in Warm + Reactivation Sheets — deterministic ownership rule

The product reality: one WhatsApp number = one inbox thread. We cannot run two parallel conversations. So:

| Question | Rule |
|---|---|
| **Which pipeline owns the conversation?** | The pipeline that **created the conversation first** — i.e. whichever Sheet was synced first for this phone. We persist that in `conversations.pipeline_id` (already a column, already populated by the existing `propagate_campaign_pipeline_to_conversation` trigger). It is **not** moved on the second sync. |
| **Where do replies go?** | To the inbox tied to `conversations.pipeline_id`. Members with access only to the owning pipeline see the reply. (Existing `can_access_pipeline` RLS already enforces this.) |
| **Which follow-up logic wins?** | The owning pipeline's. Follow-up rows are created from `first_touch` sends; we only first-touch from the **owning pipeline**, so only the owning pipeline ever schedules a follow-up for that phone. |
| **Duplicate presence across the two Sheets** | The non-owning pipeline's sync still creates a `lead_imports` row (so the operator can see "this Reactivation lead actually lives in Warm"), but with `status='duplicate'`, `conversation_id` set to the existing conversation, and `error='phone owned by pipeline <name>'`. It is **not** first-touched. Counts surface it as `duplicate` in the import report. |
| **What about a brand-new phone** that only exists in one Sheet? | Imported into that pipeline, conversation created with `pipeline_id = that pipeline`. Standard flow. |

The dedupe change in `google-sheets-sync` becomes:
1. Lookup existing `conversations` workspace-wide.
2. If found AND its `pipeline_id != source.pipeline_id` → write a `duplicate` lead row with the explanation, do **not** queue.
3. If found AND its `pipeline_id == source.pipeline_id` → standard duplicate path.
4. If not found → import into this pipeline (the dispatcher will create the conversation, owning it for this pipeline).
5. The existing `lead_imports` workspace-wide phone check is dropped — it was overly aggressive.

This rule is deterministic, observable (the operator sees "owned by X" on the duplicate row), and consistent with how the dispatcher already works.

### D3. Follow-up — runtime verification, not assumption

I will treat the existing backend as **unverified** and run an end-to-end check before claiming it works. Concretely, before shipping the UI/Slack changes I will:

1. **DB-fn sanity** — call `SELECT public.pipeline_follow_up_send_at(<pid>, '2026-05-19 17:00:00+02')` for a pipeline with the Berlin curfew and confirm the returned timestamp is the next day's 09:00 Berlin. Repeat with a 10:00 base to confirm it returns the same value unchanged.
2. **Trigger fire** — flip a test `campaign_recipients` row to `status='sent'` for a `first_touch` campaign in a Berlin pipeline and assert that one row is created in `pipeline_follow_ups` with the expected `scheduled_at`.
3. **Cancellation triggers** — insert an inbound message on that conversation, assert the follow-up row goes to `cancelled` with reason `inbound_reply`. Repeat by moving the deal to a `lost` stage, assert `cancelled_reason='stage_lost'`.
4. **Dispatch path** — set a follow-up row's `scheduled_at` to `now()`, invoke `follow-up-dispatch`, assert (a) a recipient row was inserted into the per-day follow-up campaign for the right sender, (b) `pipeline_follow_ups.status='dispatched'`.
5. **Template enforcement** — set up a sender with **no** approved variant, repeat step 4, assert the row flips to `cancelled` with reason `no_approved_template_for_number` AND (after the new code is in place) a `slack_event_queue` row exists.
6. **DST** — repeat step 1 with a date that straddles CET/CEST to confirm the offset is correct on both sides.

These checks are recorded as a checklist in the implementation PR. Any failure stops the rollout and is reported back.

---

## E. Implementation order

1. **Shared phone helper + canonical format** — create `_shared/phone.ts`, wire into both functions, return classification, preserve raw.
2. **Per-pipeline / owning-pipeline dedupe** — apply rule D2 in `google-sheets-sync`.
3. **Follow-up runtime verification** — execute D3 checks against the current code.
4. **Follow-up Slack notice** — extend `follow-up-dispatch` to emit on cancel.
5. **Operator UI** — `PipelineConfigSheet` matrix + connected sources + curfew banner + defaultCC field; `WorkspaceData` counts.

---

## F. Acceptance criteria

| Area | Pass test |
|---|---|
| Canonical phone format | Every `lead_imports.phone`, `conversations.contact_phone`, `campaign_recipients.contact_phone` written by the new code is digits-only E.164 (8–15 digits, no `+`). Raw value present in `payload._phone_raw`. |
| Normalization examples | `+49 176 30349501` → `4917630349501`. `01512xxxxxxx` with defaultCC=49 → `4915xxxxxxx`. `abc123` → `invalid`. `01234567` with no defaultCC → `ambiguous` (not queued). |
| Owning-pipeline rule | Phone X imported into Warm first → conversation `pipeline_id=Warm`. Same phone later in Reactivation Sheet → `lead_imports` row in Reactivation with `status=duplicate`, `conversation_id=<existing>`, `error='phone owned by pipeline Warm Leads'`. No second first-touch. Replies still land in Warm. |
| Shared sender pool visible | `PipelineConfigSheet` shows a 3-row matrix per template group: sender label × variant name × `Approved/Pending/Missing/Paused`. |
| Follow-up runtime (D3) | All 6 checks pass; results documented in the PR. |
| Follow-up block visible | Sender without an approved follow-up variant → row cancelled with reason AND Slack notice appears. |
| Counts surfaced | `WorkspaceData` shows `normalized / invalid / ambiguous / duplicate / skipped_test_lead` per batch. |
| 2-client repeatability | Same config done for client B with no code change. |

---

## G. Files that will need real edits

| File | New / Edit | Reason |
|---|---|---|
| `supabase/functions/_shared/phone.ts` | NEW | Shared normalizer, digits-only E.164, `ambiguous` outcome |
| `supabase/functions/google-sheets-sync/index.ts` | Edit | Use helper, owning-pipeline dedupe (D2), extended counts, preserve raw |
| `supabase/functions/lead-intake/index.ts` | Edit | Use helper |
| `supabase/functions/follow-up-dispatch/index.ts` | Edit | Emit Slack notice on cancel |
| `src/components/workspace/PipelineConfigSheet.tsx` | Edit | Sender × variant matrix, connected sources, curfew banner, defaultCC field |
| `src/pages/workspace/WorkspaceData.tsx` | Edit (small) | Show extended import counts |

No SQL migration required.

---

## H. Known limitations after this pass

- Per-lead timezone is not introduced — follow-up uses pipeline-level `follow_up_timezone` (Europe/Berlin).
- Sender round-robin stays index-based; no health/cap weighting.
- Template approval status read from `message_templates.status` — depends on existing `templates-status-sync` cron.
- Ambiguous numbers require a human to set `default_country_code` or fix the Sheet — by design we will not silently send to them.
- The owning-pipeline rule is "first-write-wins". Re-assignment of a conversation to the other pipeline is a manual operator action (not built here).
- Storage format stays **digits-only E.164** to avoid a workspace-wide data migration; `+` is added only at display time.
- `WorkspaceLibrary` write-scope RLS is out of scope for this pass.
