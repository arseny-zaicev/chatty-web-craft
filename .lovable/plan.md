## 1. Executive summary

Yesterday (May 19 GST) and today (May 20 GST) we shipped **40+ migrations** and **4 edge function rewrites** touching the exact subsystems that now feel broken: campaign dispatch, claim function, slack queue, metrics, whatsapp_message_events schema.

The single biggest delta is the **08:43 GST rewrite of `supabase/functions/campaigns/index.ts`** (97 KB, the dispatcher itself). Everything that "felt off" today (send rhythm, pacing_gap noise, FE/FM starvation, stuck campaigns) lives behind that file. My **09:57 GST `claim_due_campaign_recipients` patch** sits on top of it and changed selection semantics again.

In parallel, the **06:59 / 07:02 GST "Phase A/B" migrations** added a `source` column + canonical `metrics_for_range` over `whatsapp_message_events` and ran 6 backfill `UPDATE`s on that table. That is the most likely source of UI lag and "inbox/metrics look different".

The **"goflow campaign started by itself"** symptom is **not a regression** — already confirmed: manual one-off by Arseny's own auth user at 01:48 GST. No `parent_campaign_id`, `recurrence=none`. Leave it.

The **"strange notifications"** symptom is **not a single bug**:
- payload `last_message_text` carries the outbound template (race), already mitigated in slack-dispatch at dispatch time (10:17 GST).
- FB Media pipeline channel `C0B4LG66RJR` is unreachable, killing the whole event before the `delivery-leads` mirror — also fixed at 10:17 GST.

Recommendation: **stop touching the dispatcher today**. Do one targeted observation pass, fix only the Phase A/B `source` backfill if it's still running, and defer everything else 24h.

---

## 2. Yesterday → today change inventory

### Edge functions redeployed
| Time GST | File | Risk |
|---|---|---|
| 06:36 | `send-whatsapp-template/index.ts` | medium - send path |
| 06:36 | `process-email-queue/index.ts` | low |
| **08:43** | **`campaigns/index.ts`** (97 KB, ~all of dispatcher) | **CRITICAL** |
| 10:17 | `slack-dispatch/index.ts` (my soft-fail patch) | low |

`lead-dispatch`, `whatsapp-webhook`, `send-whatsapp`, `reply-notification-watchdog` — **not touched today**.

### Migrations applied today (May 20 GST)
| Time GST | What it does | Risk for symptoms |
|---|---|---|
| 06:34 | new table `workspace_quick_template_groups` | none |
| 06:35 | RLS relax on quick template groups | none |
| **06:59** | **Phase A**: add `source` col + 6 large `UPDATE` backfills on `whatsapp_message_events`, extend `number_ownership` | **lag, metrics drift** |
| **07:02** | **Phase B**: new `metrics_for_range` SECURITY DEFINER function | **inbox/stats look different** |
| 07:05 | (Phase C — read) | medium |
| 07:31 / 07:42 / 07:56 / 08:08 / 08:12 / 08:13 / 08:42 | misc (need per-file inspection) | medium |
| 09:19 / 09:23 | misc | low-medium |
| **09:57** | **`claim_due_campaign_recipients` rewrite — 1 row per sender** | **directly changes send rhythm** |

### Yesterday's migrations still in effect (May 19, late)
- 21:31 `system_flags.jobs.disabled` kill switch seeded
- 21:40 / 21:43 template variable sample fixes
- 17:47 raw webhook capture table (`whatsapp_webhook_raw`)
- 16:30 conversation preview sync trigger rewrite (affects `conversations.last_message_text` timing — relevant to "wrong text in Slack")
- 13:49 `reap_stuck_sending_recipients` function
- 11:49 dedupe of duplicate `lead.first_reply` rows + trigger rewrite
- 10:52 new `slack_dispatch_kick` throttle table + trigger

### Cron — unchanged
All 18 jobs still active, same schedules. `campaigns-process-every-min` and `lead-dispatch-every-min` are 1-minute jobs. **No new cron jobs today.**

### Database/runtime state
- 3 active "First touch · Reactivation Leads / DE" campaigns (Yasim/Yasin/Pramod) started at 11:18 GST — these are the **day-rollover auto-allocation** firing (normal).
- 1 cancelled goflow campaign at 01:48 GST — manual, not auto.
- All 7 client Slack channels return `missing_scope` for `info` but accept posts via `chat:write.public`; only `C0B4LG66RJR` returns `channel_not_found`.

---

## 3. Symptom → regression map

| Symptom | Likely cause (ranked) | Evidence |
|---|---|---|
| **Sending behavior changed** | (1) 09:57 claim function rewrite, (2) 08:43 dispatcher rewrite | FE/FM moved from 0→6 sends after 09:57 patch; pacing_gap drops; "selected=30 sent=1-3" log shape is new today |
| **Strange notifications** | (1) outbound text in `lead.first_reply` payload (16:30 + 11:49 May 19 trigger changes race against inbound webhook), (2) C0B4LG66RJR `channel_not_found` killed whole event before mirror | 13/15 recent payloads carried outbound template; FB Media event stuck `pending` 3 attempts |
| **Unexpected campaign start** | **Not a regression.** Arseny's own user manually created goflow campaign at 01:48 GST | `parent_campaign_id=null`, `recurrence=none`, user_id matches `arseny@iskra.ae` |
| **Performance / lag** | (1) Phase A 06:59 backfill (6 `UPDATE`s on `whatsapp_message_events`), (2) per-minute dispatcher tick now doing `selected=30` claim + per-recipient checks | Migration ran at 06:59 and likely still has long-tail vacuum/bloat; cron is 1-minute |
| **Reply/inbox visibility off** | (1) Phase B `metrics_for_range` returns different numbers from old views, (2) `tg_conversations_sync_preview_after_msg_insert` rewrite May 19 16:30 may delay `last_message_text` updates | UI panels reading old views show old totals; new function dedups by `provider_message_id` so counts can drop |
| **Noisy alerts** | (1) `member_added`, `inbox_unread_spike`, `campaign_completed/cancelled/paused` all enqueueing to Slack now (these existed before but recent slack-dispatch is more aggressive about not skipping) | `slack_event_queue` last 3h has 6 non-lead events vs 30 lead events |

---

## 4. Top 5 regression candidates (blunt)

1. **`supabase/functions/campaigns/index.ts` rewrite at 08:43 GST.** 97 KB single-file change to the heart of the send loop. All "send rhythm changed" complaints land here.
2. **Phase A migration 06:59 GST (`whatsapp_message_events.source` + 6 backfill UPDATEs + number_ownership extension).** Heavy table, vacuum lag, plan changes for any consumer joining on it. Strongest suspect for "lag".
3. **Phase B migration 07:02 GST (`metrics_for_range`).** New SECURITY DEFINER function that dedups events differently. If UI panels were switched over, counts will look "wrong" vs what users remember.
4. **`tg_conversations_sync_preview_after_msg_insert` trigger rewrite (May 19 16:30 GST).** Re-orders when `conversations.last_message_text` is updated, which is the root cause of "wrong text in Slack" (race with `campaign_recipients.status='replied'` trigger).
5. **`claim_due_campaign_recipients` patch at 09:57 GST (mine).** Capped at "1 per sender" which fixed FE/FM but means total per-tick throughput drops to `count(active senders)` per minute (~30–60 sends/min ceiling). For low-active-sender clients this is fine; for big workspaces it can look like a throttle.

---

## 5. Stabilization plan for today

### Fix now (low risk, high signal)
- **Nothing else in the dispatcher today.** It is moving. Two consecutive same-day rewrites would compound risk.
- Resolve FB Media `slack_channel_id` — manual Slack action by Arseny (invite bot to `C0B4LG66RJR` or replace channel ID). Already non-fatal thanks to 10:17 mirror fix.

### Monitor only
- `pg_stat_activity` for long-running queries on `whatsapp_message_events` (Phase A bloat).
- `slack_event_queue` pending count per hour — alert if >10.
- `campaigns-process` log shape: target `sent ≈ active_senders` per tick, `failed=0`, `pacing_gap` only on rows actually skipped.
- FE / FM `sent_count` deltas hourly.
- A diff of any UI panel that switched to `metrics_for_range` vs its previous source.

### Defer 24-48 h
- Any further `claim_due_campaign_recipients` tuning (raising the per-sender cap, weighted selection, starvation logic).
- Refactoring `campaigns/index.ts` (still warm from today's rewrite).
- Any migration on `whatsapp_message_events` (let Phase A vacuum settle).
- Slack noise reduction (mute `campaign_completed` etc.) — cosmetic.

### Do not touch
- Cron schedule. Stable.
- `whatsapp-webhook`, `send-whatsapp`, `lead-dispatch` — not changed today, behaving fine.
- Trigger that enqueues `lead.first_reply` — race already mitigated at dispatch.

---

## 6. Rollback decision rule

Rollback is the right move **only if at least two** of the following are still true after 2 hours of monitoring with no further edits:

1. FE *and* FM `sent_count` flatline (no increase across 4 consecutive `campaigns-process` ticks during a window with `scheduled` rows due).
2. `campaigns-process` logs show `selected≥10` but `sent=0` per tick repeatedly, with `pacing_gap` accounting for ≥90% of skips.
3. Per-minute DB CPU stays >70% with `whatsapp_message_events` in `pg_stat_activity` top queries.
4. New unexplained errors in `campaigns/index.ts` logs that did not exist yesterday.

If those hold:

**Target order for rollback (smallest blast radius first):**
1. Revert `supabase/functions/campaigns/index.ts` to its May 19 version (preserve today's `claim_due_campaign_recipients` SQL — it's independent).
2. If still broken: revert `claim_due_campaign_recipients` to its May 19 definition too.
3. If still broken: revert the **07:02 `metrics_for_range`** function (drop and recreate from yesterday).
4. Last resort: revert the **06:59 Phase A** migration (the `source` column add is harmless; only roll back the trigger/index changes; keep the data).

**Features to preserve through rollback** (re-apply on top of the reverted dispatcher):
- `workspace_quick_template_groups` table + RLS (06:34/06:35) — UI-only, leaves DB intact.
- `number_ownership` extensions (rate_usd, role, notes, source_bm_assignment_id) — additive, keep.
- `whatsapp_message_events.source` column — additive, keep; only revert any code that *reads* from it.
- `slack-dispatch` 10:17 soft-fail patch — keep, independent of dispatcher.

Do not roll back the May 19 trigger and webhook changes — they fix older bugs and are not implicated in today's send symptoms.

---

### Files I read to produce this audit
- All `supabase/migrations/20260520*.sql` (today)
- `supabase/migrations/20260519*.sql` index
- `mtime` on every file under `supabase/functions/`
- `cron.job` schedule list
- `campaigns` table snapshot for last 24h
- `slack_event_queue` last 3h sample (from prior turn)
