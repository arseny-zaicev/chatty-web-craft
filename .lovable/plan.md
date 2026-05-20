
# Core-Systems Audit (no implementation)

## 1. Executive summary

The core "audience -> send -> reply -> notify" loop works end-to-end today, but it is brittle in three concentrated places:

1. **`supabase/functions/campaigns/index.ts` (2,143 lines)** owns launch, dispatch, prepare, kill switch, snapshots, daily caps, redistribution, retry, and runtime status. Every recent incident (FE/FM stall, 1-per-tick cap, deferred-to-next-day surprise, snapshot deadlock, "Could not reserve any rows") touched this one file. It is the single largest blast-radius surface in the project.
2. **Pacing/quotas are split across three layers** (`campaigns.launch` capacity math, `claim_due_campaign_recipients` SQL, `processQueue` per-tick floors + per-number Dubai-day count). The layers were rewritten independently this week and now duplicate or contradict each other - the right now backlog of **6,760 past-due `scheduled` rows** is the symptom.
3. **Sheets -> lead-dispatch -> first-touch** is functionally correct but is silently absorbing a high % of leads as `skipped`/`invalid` (pipeline `bb13117d`: 756 skipped / 120 invalid vs 407 sent in 7 days). Operators don't see why because all that signal lives in `campaign_dispatch_events` + `lead_imports.error`, not in any UI screen.

Inbound capture, Slack lead notifications, and delivery-truth from webhooks are solid. Invite/onboarding is functional but has a 500-user `listUsers` scan that will break later.

Net: the product is reliable for ~today, but one more change to `campaigns/index.ts` without splitting it will regress something. Reliability gains here are 5-10x cheaper than feature work.

---

## 2. PASS / PARTIAL / FAIL table

| # | Core area | Verdict | Evidence |
|---|---|---|---|
| 1 | Campaign launch correctness | **PARTIAL** | Snapshot/prepare flow works, capacity math works, but launch path is intertwined with reserve-rows in UI (`LaunchWizard.tsx` line 837) and one failed launch orphans audience rows in `reserved` (Resonate Group B: 250 stuck rows today, fixed via 15-min auto-reclaim). Launch logic itself is 500+ lines inside the 2,143-line file. |
| 2 | Outbound sending / dispatch timing | **PARTIAL** | Cron is firing every minute and sending (228 sent in last hour, 4,674 sent in last 7 days). But **6,760 recipients are past-due `scheduled` right now**, including 1,463 on one paused campaign and 197/180/165 on the 3 active FE Reactivation campaigns. Pacing logic in `processQueue` (lines 1149-1173) and `claim_due_campaign_recipients` SQL both gate concurrency and were rewritten this week - they are not yet aligned. |
| 3 | Google Sheets lead -> send | **PASS** with caveat | `google-sheets-sync` (every 2 min) -> `lead-dispatch` (every 1 min) -> `campaign_recipients` is working: heartbeats 30s/508s old. Caveat: pipelines with disconnected source connections silently mark leads as `skipped` (756 in 7d on one pipeline) - no operator surface for this. |
| 4 | Inbound reply capture / inbox visibility | **PASS** | `whatsapp-webhook/handleInbound` (lines 62-450) has idempotency by `provider_message_id`, 3-strategy number matching, recipient linking, conversation upsert, pipeline inference, opener backfill, cross-country quarantine. 262 inbound persisted in 24h, 1 persist failure. Solid. |
| 5 | Slack lead/reply notifications | **PASS** | `lead.first_reply` -> client pipeline channel + mirror to `delivery-leads` (110 sent / 80 skipped via qualification guardrail in 24h). `campaign_launched`/`scheduled`/`completed` now also go to client channel (today's fix). Queue draining cleanly (only 1 `pending`). |
| 6 | Delivery tracking truth | **PASS** | `handleStatus` maps Gupshup `sent/delivered/read/failed` -> messages.status and force-flips `campaign_recipients` to `failed` with composed `[code] reason`. 24h: 2,639 enqueued / 1,896 sent / 1,791 delivered / 1,226 read / 691 failed - ratios look real. Failure reasons are mostly Meta-side (BM locked #131031: 400, undeliverable #131026: 135). |
| 7 | Invite / onboarding | **PARTIAL** | `workspace-invite-link/accept` works for new + returning users, has proper expiry/seats/role/pipeline-scope logic. But line 120 does `auth.admin.listUsers({ page: 1, perPage: 200 })` to find existing emails - this will silently fail once the auth user count exceeds 200. Should be `getUserByEmail` or admin search. |
| 8 | Overall app lag / core performance | **PARTIAL** | `LaunchWizard.tsx` is 2,045 lines with 24 hooks; `PipelineConfigSheet.tsx` 1,865; `CRM.tsx` 1,211; `Pipeline.tsx` 1,142; `WorkspaceData.tsx` 1,141. Multiple components poll every 5-30s (`CampaignRuntimePanel` 5s, `NumbersInventory` 30s, `CampaignReportPanel` 30s, `PipelineConfigSheet` 15s, `WorkspaceCampaigns` 30s). `supabase/types.ts` 4,686 lines reloads on every change. No measured runtime errors right now, but the launch/CRM pages are heavy enough that any cascading re-render is felt. |

---

## 3. Core dependency map

```text
Audience pool (audience_batches/rows)              Google Sheet
  │                                                     │
  │ reserveRows (RPC, now 15-min auto-reclaim)          │ google-sheets-sync (*/2 min)
  ▼                                                     ▼
LaunchWizard.tsx ──► campaigns:prepare ──► campaigns:launch ──► campaign_recipients
                                                                       │
                              every minute  pg_cron ──► campaigns(process)
                                                       │     │
                                                       │     ├─ claim_due_campaign_recipients (SQL fairness + pipeline cap)
                                                       │     └─ processQueue (Dubai daily cap + pacing + canary + sendTemplate)
                                                       ▼
                              every minute  pg_cron ──► lead-dispatch ──► first_touch campaigns ──► campaign_recipients
                                                       │
                                                       ▼
                                                  Gupshup API ──► whatsapp-webhook (status + inbound)
                                                                       │
                              ┌──── handleStatus ─────┴──── handleInbound ────┐
                              ▼                                                ▼
                       messages/recipients status              conversations + messages (inbox)
                              │                                                │
                              ▼                                                ▼
                    campaign trigger ──► slack_event_queue ◄── lead.first_reply enqueue
                                                       │
                              every minute  pg_cron ──► slack-dispatch ──► ops + client channels
```

Single points of failure (in priority order): `campaigns/index.ts` ▶ `whatsapp-webhook/index.ts` ▶ `claim_due_campaign_recipients` ▶ `lead-dispatch/index.ts` ▶ `slack-dispatch/index.ts`.

---

## 4. Top failure points / regression risks

1. **Past-due backlog of 6,760 rows.** Cron is sending, but throughput < arrival rate. Likely cause: `claim_due_campaign_recipients` returns at most `p_limit=30` per tick and bounds per-sender via `sender_rank <= 15`, while paced first-touch campaigns are still subject to the in-tick pacing floor + per-number Dubai-day count in `processQueue`. The two layers were touched on 20260520 (multiple migrations) and the new behavior was not stress-tested at 7,000-row backlog.
2. **`campaigns/index.ts` is the blast radius.** Launch (150-664), processQueue (776-1390), blast (1390-1468), pause/resume/cancel (1468-1512), redistribute (1512-1681), retry (1681-1854), prepare (1881-2015), kill switch (2017-2069), runtime (2072-2143). One bad edit anywhere breaks all senders for all clients. The 2026-05-20 "FE/FM 0 sent" incident note is still in the file as a comment.
3. **Reserve-rows + launch coupling.** `LaunchWizard.launch.mutationFn` reserves audience rows BEFORE invoking `campaigns:launch`, then on launch failure tries to release them client-side. Any browser tab close between those steps = orphaned `reserved` rows (just happened to Resonate Group B). 15-min auto-reclaim in `reserve_audience_rows` partially mitigates but the design is still racy.
4. **Pipeline-level `daily_cap` enforcement is correct but invisible.** The new SQL excludes pipeline candidates entirely once cap hit. From the operator's perspective the 200/number quota appears to be the cap, but the real cap is now pipeline-level. Today only 1 reason logged: `daily_cap_reached` x248. No UI label saying "Reactivation: 50/50 today, all paused".
5. **`whatsapp-webhook` no-match failures land in `whatsapp_webhook_failures` with `replay_status='pending'`** but there's no automatic replay scheduler I can see being invoked - they require manual `whatsapp-webhook-replay`. Cross-country quarantine path (line 446) drops a message silently from pipeline; only console.warn. If a real new chat number gets misrouted this way, no one sees it.
6. **lead-dispatch silent skips.** Pipeline `bb13117d` shows 756 skipped, 120 invalid, 130 replied vs 407 sent. `skipped` reasons (orphan source, duplicate first-touch, phone revalidation) are logged inside the function but only surface as `lead_imports.error` text. No "why did this lead never send?" view.
7. **Invite flow paginates to 200.** `admin.listUsers({ page: 1, perPage: 200 })` (line 120) - once auth users > 200, returning users with existing accounts get treated as new and `createUser` fails with duplicate email.
8. **Frontend polling stack.** 6 panels with 5-30s `refetchInterval`. Most use `visibleRefetchInterval` (good), but `CampaignRuntimePanel` polls every 5s unconditionally - leaving it open in a tab keeps the campaigns function warm but also runs `runtimeStatus` constantly (5 separate queries each call).

---

## 5. Large-file / structure risks

| File | Lines | Risk |
|---|---|---|
| `supabase/integrations/supabase/types.ts` | 4,686 | Generated; reloads everything on schema change. Acceptable. |
| `supabase/functions/campaigns/index.ts` | 2,143 | **Critical.** 9 distinct responsibilities, one Deno.serve. Touching anything risks all sending. |
| `src/pages/workspace/LaunchWizard.tsx` | 2,045 | Highest-leverage UI; owns mapping, snapshot fingerprint, reserveRows, launch invoke, capacity math, schedule preview, dispatch panel binding. Any bug = no launches. |
| `src/components/workspace/PipelineConfigSheet.tsx` | 1,865 | Single sheet contains every pipeline knob; high re-render cost when polled every 15s. |
| `src/pages/admin/FleetRegistry.tsx` | 1,410 | Non-core; admin-only. |
| `src/pages/admin/PartnerDetail.tsx` | 1,346 | Non-core; partner finance. |
| `src/pages/CRM.tsx` / `src/pages/Pipeline.tsx` | 1,211 / 1,142 | Core inbox/deals views; large but stable. Heaviest re-renders for active operators. |
| `src/pages/workspace/WorkspaceData.tsx` | 1,141 | Audience uploads + prep; medium risk. |
| `supabase/functions/whatsapp-webhook/index.ts` | 845 | Acceptable but at upper limit; handleInbound is 388 lines. |
| `supabase/functions/lead-dispatch/index.ts` | 643 | One large `processPipeline` doing template resolve, cap, claim, validate, dedupe, sibling create, schedule, insert, link. Hard to test in isolation. |

---

## 6. Technical clutter / non-core drag

- **AI / SEO surface:** `generate-ai-seo-report`, `auto-generate-insights`, `audience-ai-prepare`, `campaign-insights`, `ops-assistant`, `AISeoReport.tsx` (686 lines), `classify-replies`. Useful, but they share none of the core dispatch path and add ~3-5 functions to monitor.
- **Finance/partner surface:** `payout-report-pdf`, `manager-payout-report-pdf`, `slack-payout-post`, `bm_partner_assignments`, `business_managers`, `business_manager_warmup_events`, `FinancePartners*`, `Reconciliation.tsx`, `Partners.tsx`. Entirely orthogonal to core sending; safe but adds ~6 cron-adjacent tables and weekly migrations.
- **Multiple slack dispatchers:** `slack-dispatch`, `slack-morning-digest`, `slack-evening-digest`, `slack-pipeline-digest`, `slack-inbox-watch`, `slack-payout-post`. The cron + queue design is sound, but consolidating digest functions would reduce per-deploy surface.
- **Two webhook replay paths:** `whatsapp-webhook-replay` + `reconcile-messages`. Both exist for different scenarios but operators don't know which to use.
- **Marketing/site code in same repo:** `Index.tsx`, `Apply.tsx`, `Book.tsx`, `SellerLeads.tsx`, `WhatsAppApply.tsx`, `BrandAssets.tsx`, `AISeoReport.tsx`, `Founder*`, `Hero*`, `ROICalculator.tsx`, `QualificationForm.tsx`, `SellerLeadsForm.tsx`. Combined ~6,000 LOC; not in the core operator app. Their re-renders/bundles slow Vite HMR on workspace pages.

---

## 7. Stabilization plan (priority order, no implementation yet)

**P0 (today/tomorrow) - protect throughput and money flows**

1. Drain the 6,760 past-due backlog. Diagnose whether the bottleneck is `claim_due_campaign_recipients`'s `p_limit=30` + `sender_rank<=15` (= 30 max/tick across all senders) or `processQueue`'s remaining per-number pacing floor. Decide one canonical pacing layer (recommend: SQL claim does fairness + global cap; processQueue does provider + canary only).
2. Add a tiny `processQueue` heartbeat write to `system_heartbeats` (currently 9+ days stale - we have no live signal that the function is running). 5-line fix.
3. Surface pipeline-level `daily_cap` usage in `WorkspaceCampaigns`/runtime panel - "Reactivation 50/50 used today". Operators have no way to see why their sends stopped.

**P1 (this week) - split blast radius**

4. Split `supabase/functions/campaigns/index.ts` into routed files under `campaigns/`:
   - `launch.ts` (lines 150-664)
   - `prepare.ts` (1881-2015)
   - `process.ts` (776-1390)
   - `mutate.ts` (pause/resume/cancel/redistribute/retry/killSwitch)
   - `runtime.ts` (status)
   - `index.ts` = thin router + auth
   Same edge function, no behavior change. Just gives every future edit a much smaller scope and makes diff review trustworthy.
5. Decouple `LaunchWizard.launch.mutationFn` from `reserveRows`: either move reservation server-side into `campaigns:launch` (atomic with campaign insert) or guarantee release even on tab-close via a server-side TTL (already partially there with 15-min auto-reclaim).
6. Fix invite flow: replace `listUsers({ perPage: 200 })` with `admin.getUserById`/email lookup.

**P2 (next 1-2 weeks) - operator visibility**

7. Build a single "Why didn't this lead send?" view per pipeline reading `lead_imports.status/error` + `campaign_dispatch_events`. Today operators have no surface for the 756 skipped leads on `bb13117d`.
8. Auto-replay `whatsapp_webhook_failures` with `replay_status='pending'` on a 15-min cron (or fold into `health-watchdog`). Today they require manual replay.
9. Consolidate `CampaignRuntimePanel` 5s polling into a single workspace-wide channel or bump to 10s when no campaign is `running`.

**P3 (later) - structural**

10. Split `LaunchWizard.tsx` into mapping/audience/schedule/dispatch/launch subcomponents (no behavior change).
11. Move marketing site pages (`Index`, `Apply`, `Book`, `SellerLeads*`, `WhatsAppApply`, `AISeoReport`, `BrandAssets`) behind a lazy route group so workspace HMR doesn't reload them.
12. Optionally extract `whatsapp-webhook/handleInbound` and `handleStatus` into helpers (845 lines is at the readable ceiling).

---

## 8. What we should NOT touch yet

- **`claim_due_campaign_recipients` SQL.** Just rewritten 3x this week; one more change without a defined contract between it and `processQueue` will regress sends again. First decide the layering, then touch.
- **`whatsapp-webhook` (inbound + status).** It is the most reliable piece. No structural change until P3.
- **`slack-dispatch` event types.** Today's `CLIENT_VISIBLE_CAMPAIGN_EVENTS` change just shipped; let it bake.
- **Gupshup retry/backoff (`provider_backoff` + canary).** Working, caught the #131031 lockout cleanly (400 failed messages all attributed to one BM, no cascade).
- **Pipedrive/CRM, finance/payouts, AI SEO, marketing site forms.** Non-core; leave alone until P3 to keep change surface small.
- **`supabase/integrations/supabase/types.ts`.** Auto-generated.
- **Cron cadence.** All 5 cron jobs (`* * * * *` for campaigns/slack/lead-dispatch, `*/2` for sheets, `*/5` for health, `0 5-17` for templates, `15 * * * *` for reply watchdog) are currently aligned and not the bottleneck.
