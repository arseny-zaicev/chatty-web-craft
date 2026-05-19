## Three problems, one coordinated fix

### Problem 1 — Lead routing: pipeline pulls leads from disconnected sources

**Root cause (confirmed by DB):**
- `lead-dispatch` selects `lead_imports` filtered by `pipeline_id` + status (`pending/awaiting_manual/queued`), but does NOT filter by an active `source_connection_id`.
- When a Google Sheet source is disconnected/replaced, the FK is `ON DELETE SET NULL`, so 100+ rows from the old "Fitpreneur Old Leads until 17th of may" batch remain in `lead_imports` with `source_connection_id = NULL` and `status` still in the dispatchable set.
- Result: the new "Fitpreneur Outbound Leads" pipeline silently inherits the old reactivation queue and sends to numbers like Bes Sa / Gerald Gautsch that are not in the current sheet.

**Fix:**

1. **DB migration** — partial index + helper view for fast active-source filtering. Add a `lead_imports.is_orphan` generated check (queryable) and a NOT VALID FK trigger to mark NULL `source_connection_id` rows as orphan candidates.
2. **`supabase/functions/lead-dispatch/index.ts`** — change the lead query to:
   - Join `source_connections sc` and require `sc.status = 'active'` AND `sc.pipeline_id = lead_imports.pipeline_id`.
   - Legacy rows where `source_connection_id IS NULL` are only processed if the pipeline currently has at least one active `webhook`/`api`/`manual` source (Sheets-only pipelines skip them).
   - Skipped orphan leads are flipped to `status='skipped', error='orphaned_source'` and logged once to `pipeline_events`.
3. **One-time backfill** (insert tool, after approval) — for every `lead_imports` row that is currently `pending/awaiting_manual/queued` AND its `source_connection_id` is NULL AND the pipeline has no NULL-source-compatible connection, set status to `skipped`, error `orphaned_source`. Affects ~96 rows from the old batch.
4. **Source disconnect UX** — when the user removes/replaces a Sheets source in `PipelineConfigSheet`, show a confirm: "There are N queued leads tied to this source. Discard them? / Keep them?". Default = discard. Implemented as a small RPC `purge_pending_leads_for_source(source_id)`.
5. **Pipeline header chip** — show `queued · awaiting · sent today / cap` so user sees the queue size before pressing Resume.

### Problem 2 — Delivery status is wrong / not updating in UI

**Root cause (confirmed by DB):**
- Gerald Gautsch: Gupshup returned `failed` (code 4003, "template did not match"). `whatsapp_message_events` recorded `failed`, but `campaign_recipients.status` stayed `sent` because the webhook handler's lookup by `provider_message_id` missed the recipient (race / mismatch).
- Bes Sa: `campaign_recipients` correctly flipped to `failed`, but `lead_imports.status` stayed `sent` — there is no cascade from recipients → lead_imports on failure.
- Net effect: UI shows "sent" for messages that WhatsApp itself rejected, daily cap is consumed by failures, and the user has no way to know.

**Fix:**

1. **`supabase/functions/whatsapp-webhook/index.ts`** — on every `failed/rejected/error` event:
   - Look up the recipient by `provider_message_id` with a 3× retry (200/500/1500 ms) to cover the insert race.
   - If found: `UPDATE campaign_recipients SET status='failed', error_code=…, error_message=…`.
   - Cascade: `UPDATE lead_imports SET status='failed', error=… WHERE campaign_recipient_id = recipient.id`.
   - Add a DB trigger `sync_lead_import_status_from_recipient` as a belt-and-suspenders safeguard so any future code path that flips `campaign_recipients.status` automatically cascades to `lead_imports`.
2. **Backfill (insert tool)** — for the last 30 days, take every `whatsapp_message_events` row with `event_type IN ('failed','rejected','error')`, find its `campaign_recipients` by `provider_message_id`, flip recipient → `failed` and cascade to `lead_imports`. Expected to fix Gerald and any silent failures since launch.
3. **Realtime UI** — `LeadCard` / pipeline list:
   - Subscribe to `campaign_recipients` and `whatsapp_message_events` for the open lead, so status flips appear without reload.
   - Show a "Delivery" block with the real event chain: `queued → sent → delivered → read` OR `failed (code 4003: template mismatch)`. Source of truth = latest `whatsapp_message_events` row, not `lead_imports.status`.
   - Pipeline counter (queued/sent/replied) recomputed from recipients + events, not from `lead_imports`.

### Problem 3 — Phone `+6643601497` not normalized

**Root cause (confirmed by DB):**
- Row was imported on 2026-05-17 (old "Fitpreneur Old Leads until 17th of may" batch) with `source_connection_id = NULL`, no `default_country_code` and no `_phone_raw` payload.
- Number is 10 digits — for Thailand (+66) the correct mobile is 11 digits: leading `0` was likely stripped before reaching normalizer, or the import path bypassed `normalizePhone` entirely (this batch predates the current normalizer).
- Today's normalizer (`supabase/functions/_shared/phone.ts`) WOULD flag this as `ambiguous` and refuse to send — but the row was stored before that rule existed, so it slips through `lead-dispatch` which only sees the final `phone` column.

**Fix:**

1. **`supabase/functions/lead-dispatch/index.ts`** — before dispatching, re-validate each lead's `phone` with `normalizePhone(li.phone, sourceConn.default_country_code)`. If it returns `invalid` or `ambiguous`, flip the lead to `status='invalid'`, write `error='phone_revalidation_failed: <reason>'`, log to `pipeline_events`, and skip. This catches both this Thai number and any other legacy malformed rows.
2. **Add `default_country_code` to `source_connections.config`** — already there for new sources via `google-sheets-sync`. Add it explicitly to `PipelineConfigSheet` UI (dropdown) so the operator MUST pick a fallback country when connecting a sheet.
3. **One-time scan (read_query, then insert tool)** — find all `lead_imports` where `length(phone) <= 10` AND status is dispatchable, list them in a small admin view, and mark them `invalid` after user confirms. Expected ~few rows; Gerald is one of them.
4. **UI surface** — in the pipeline lead list, invalid-phone leads get a yellow badge "Phone needs review" with the raw value and a quick-edit field, so the operator can fix and re-queue instead of losing the contact.

---

### Files touched

- `supabase/functions/lead-dispatch/index.ts` — active-source filter, phone re-validation, orphan handling
- `supabase/functions/whatsapp-webhook/index.ts` — failure cascade, retry on lookup
- `supabase/functions/_shared/phone.ts` — no changes (already correct)
- DB migration:
  - trigger `sync_lead_import_status_from_recipient`
  - RPC `purge_pending_leads_for_source(uuid)`
  - index on `lead_imports(pipeline_id, source_connection_id, status)`
- DB backfill (insert tool, separate step): orphan leads + failed-event sync + invalid phones
- `src/components/workspace/PipelineConfigSheet.tsx` — queue summary chip, country-code field, source-disconnect confirm, "Purge queue" button
- `src/components/workspace/LeadCard.tsx` (or equivalent) — real delivery chain UI, realtime subscription
- `src/components/workspace/PipelineLeadList.tsx` — "Phone needs review" badge, status from events

### Order of execution

1. Migration (triggers + indexes + RPC) — needs your approval.
2. Edge function fixes (`lead-dispatch`, `whatsapp-webhook`) — deploy.
3. Backfill three sets in one batch via the insert tool — needs your approval.
4. UI changes in `PipelineConfigSheet`, `LeadCard`, lead list.
5. Smoke test on the Fitpreneur Outbound Leads pipeline with `daily_cap=1`.

### Questions before I start

1. **Orphan leads (~96 rows)** — set them all to `skipped` immediately, or surface them in a "Review" tab first so you can rescue any that are legit?
2. **Phone re-validation** — block sending and mark `invalid`, OR auto-prepend the source's `default_country_code` if it looks like a national number? (I recommend block + UI badge.)
3. **Source disconnect default** — when removing a Sheets source, default to discard queued leads or keep them?
