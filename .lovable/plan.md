## What actually went wrong

### Incident A - 599/600 failed with WhatsApp `(#131008) Required parameter is missing`

**Why.** Variable substitution lived in **two places**:

- `renderTemplateBody()` - used by the wizard preview AND by the conversation message body after send. Had a `"there"` fallback for empty first variable.
- The `params` array built inline at `supabase/functions/campaigns/index.ts:797-798` and shipped to Gupshup. **No fallback** - empty string was sent, WhatsApp rejected the whole template.

The preview looked correct, the inbox text looked correct, but the actual API call carried `""`. Two source-of-truth divergence.

There was also no pre-flight check at launch time that would have caught "all 600 recipients have empty `{{1}}`" before the campaign went live.

### Incident B - failed-recipient retry blasted at 10x intended rate

**Why.** When I re-queued the 599 failed recipients, I set `scheduled_at = now() + random(30..1200)s` (i.e. spread over 20 minutes). The campaign is configured for `delay_min=60s, delay_max=120s` **per number**. With 3 numbers running, intended pace is ~1 send / 30s globally. My retry produced ~30 sends / minute - 10x faster.

Root cause: the "reset failed to scheduled" operation was an ad-hoc SQL update with no awareness of the campaign's pacing rules. There is no built-in "retry failed" path that re-applies the configured delays.

---

## Plan

### 1. Single source of truth for template variables

Create `supabase/functions/_shared/template.ts` exporting:

- `buildTemplateParams(template, recipientVars)` -> `string[]` for Gupshup
- `renderTemplateBody(template, recipientVars)` -> rendered text for inbox

Both call the same internal `resolveVar(name, idx, raw)` so the `"there"` fallback (and any future rule like trimming, stripping newlines, max length) is applied identically. Mirror it in `src/lib/launchData.ts` as a thin re-export so the wizard preview, the edge function send path, and the inbox renderer cannot drift again.

### 2. Pre-flight validation at launch

In the `launch`/`schedule` action of `supabase/functions/campaigns/index.ts`, before the campaign transitions to `scheduled`/`running`:

- Aggregate over `campaign_recipients`: how many have an empty value for variable index 0 (name), how many have empty values for any other variable.
- If >5% of recipients have empty non-name variables -> hard fail with a clear message.
- If 100% of recipients have empty name -> show a soft warning the wizard must acknowledge ("All recipients will be greeted as 'there'. Continue?").
- Also reject launches where `template.variables` count does not match the number of `{{N}}` placeholders in `template.body`.

### 3. First-N canary on every campaign send

In `processQueue`, when a campaign first transitions `scheduled -> running`, send the **first 3 recipients** and inspect the result before unlocking the rest:

- If all 3 fail with the same provider error (#131008, #132001, etc.), set `campaign.status = 'failed'`, write the error to `campaign.last_error`, and emit a Slack alert. The remaining 597 stay `scheduled` but the worker skips campaigns whose status is `failed`.
- If at least 1 of 3 succeeds, proceed normally.

This caps any future template/config bug at 3 wasted sends, not 600.

### 4. First-class "retry failed" action

Add a `retry_failed` action handler in `supabase/functions/campaigns/index.ts` that:

- Resets `failed` recipients to `scheduled`, clears `error_message` and `provider_message_id`.
- Rebuilds `scheduled_at` using the campaign's own `delay_min_seconds`/`delay_max_seconds` per number, starting from `now()` and respecting `schedule_window_start`/`schedule_window_end` (so retries do not blast outside business hours).
- Re-opens the campaign (`status = 'running'`).

Expose a button in the campaign card so this never has to be done by hand-written SQL again.

### 5. Make pacing impossible to bypass

Add a server-side guard: a trigger (or a check inside `processQueue` before the per-recipient `pace`) that, when the gap between two consecutive `scheduled_at` values **for the same `whatsapp_number_id` in the same campaign** is shorter than `delay_min_seconds`, treats it as a misconfiguration and skips the recipient until the minimum gap has elapsed. This protects against any future bulk-update mistake (manual SQL, admin tool, retry script) that ignores pacing.

### 6. Minimal observability

- Add a `campaign_errors` view: `(campaign_id, error_message, count, first_seen, last_seen)` aggregating distinct provider error messages over `campaign_recipients`. The campaign card surfaces the top 3 errors so the operator notices "599 of these all say #131008" within seconds, not after the fact.
- On every `processQueue` tick that produces ≥10 failures with the same error code on the same campaign, post a single Slack message to the workspace channel ("Gs Main: 23 sends failed with #131008 in last minute"). Throttled to one alert per campaign per 5 minutes.

### 7. Regression test

Add `supabase/functions/campaigns/template_test.ts` covering:

- Empty first var -> param[0] === "there", body contains "Hi there,"
- Empty middle var -> param[i] === " " (Gupshup-safe), body has empty span
- Mismatched variable count -> `buildTemplateParams` throws
- Identity: `buildTemplateParams(t, vars).length === t.variables.length`

Wired into the existing edge-function test runner so a future refactor cannot ship the divergence again.

---

## Implementation order

1. Shared `template.ts` + tests (#1, #7) - 1 small PR, low risk, kills the original bug class.
2. Pre-flight validation (#2) - same PR, called from `launch`/`schedule`.
3. Retry-failed action + UI button (#4) - one edge-function action, one button.
4. Canary + per-campaign error aggregation + Slack throttled alert (#3, #6) - one PR.
5. Pacing guard in worker (#5) - last, because it changes scheduling semantics and needs the most care.

## Recommendation

This is cleanup, not new feature work, and it pays for itself the first time someone launches a 5,000-recipient campaign with a typo in the template. Land #1-#4 before the next big launch; #5-#6 can ship the week after.