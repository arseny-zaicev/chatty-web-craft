# Technical Audit — CRM, Pipeline, Campaigns, Inbox

Scope: 45k LOC frontend, 14k LOC edge functions, ~50 functions, single Supabase project. Findings tied to concrete files. No code changes.

## 1. Executive Summary

The app works but has crossed the "small-team prototype" threshold. The two main structural problems:

1. **Mega-files holding mixed concerns.** `CRM.tsx` (1116), `Pipeline.tsx` (1142), `LaunchWizard.tsx` (1950), `PipelineConfigSheet.tsx` (1590), `WorkspaceData.tsx` (1136), and `campaigns/index.ts` (2396) each combine UI, data-fetching, mutation, realtime, and business rules. They are now the dominant source of regression risk - every recent feature (49-prefix fix, automations, stage rules, slack throttle) had to be threaded through 3-5 of them.
2. **Drifting backend conventions.** `normalizePhone` exists in 4 different forms across `_shared/phone.ts`, `whatsapp-webhook`, `campaigns`, and `audienceData.ts`. Slack dispatch is half cron-based, half trigger-based. `campaigns/index.ts` is a 2.4k-line action router that has absorbed launch, blast, prepare, kill-switch, runtime, templates, redistribute, retry, and process - this is where most silent failures will originate next.

The frontend has 162 direct `supabase.from(...)` calls across 60 files and 103 ad-hoc `invalidateQueries` calls. There is no data-layer boundary - any page can read or mutate any table, which is why query-invalidation bugs (stale pipeline counts, stale stats) keep returning.

Nothing here is on fire. But the next 2-3 features will get materially harder unless the worst hotspots are split.

## 2. Top Highest-Risk Technical Areas

### R1. `supabase/functions/campaigns/index.ts` (2396 lines, 10+ actions)
Single file routes `launch`, `blast`, `prepare`, `kill_switch`, `runtime_status`, `upsert_template`, `sync_templates`, `sync_templates_all`, `pause/resume/cancel`, `redistribute`, `retry_failed`, `process`. Local `normalizePhone` diverges from `_shared/phone.ts` (no country-code repair) - leads inserted by `campaigns` will not get the `49` prefix fix that `lead-intake` got. High blast radius: any edit risks every campaign action.

### R2. `src/pages/CRM.tsx` (1116 lines, 22 useState, 2 realtime channels)
Number filter, starred/replied/unread/my filters, pipeline filter, sort, conversations list, messages, draft, sending, search, assignment, pinning, marking read - all in one component with derived state recomputed on every render. The two `useRealtimeTable` calls write directly into local `conversations`/`messages` arrays while react-query keeps a separate cache. Source of "list doesn't refresh" and "unread count wrong" classes of bugs.

### R3. `src/pages/Pipeline.tsx` (1142 lines)
DnD, stage CRUD, deal CRUD, automations dialog, conversation peek, assignment, multi-pipeline switching in one file. Recent `49`-prefix fix had to be applied to `deals.contact_phone` separately from `leads.phone` because the two paths don't share normalization. Cross-pipeline moves go through `moveDealToPipeline` but stage automations resolve targets independently - drift risk.

### R4. `src/pages/workspace/LaunchWizard.tsx` (1950 lines, 39 useState)
Largest page in the app. Combines audience selection, prep profile picking, template validation, sender allocation, schedule editing, dry-run, launch. This is where operators report the most "I clicked launch and nothing happened" silent failures - errors are caught and toasted but launch state is not persisted, so a refresh loses everything.

### R5. `src/components/workspace/PipelineConfigSheet.tsx` (1590 lines, 34 useState)
Stage editing, color editing, ordering, automations preview, pipeline rename, archive, defaults - all in one sheet. Overlaps heavily with `StageAutomationsDialog.tsx` (459) and `PipelinesView.tsx` (418). When a stage rule misbehaves it is unclear which of the three owns the truth.

### R6. Phone normalization sprawl
- `supabase/functions/_shared/phone.ts` (247 lines, the "correct" one)
- `supabase/functions/whatsapp-webhook/index.ts:15` (local copy)
- `supabase/functions/campaigns/index.ts:24` (local copy)
- `src/lib/audienceData.ts:80` (frontend copy)
Each handles `49` prefix differently. This is why the same lead can appear with `1...` in deals and `491...` in conversations. Highest-leverage cleanup in the codebase.

### R7. Slack pipeline (half cron, half trigger)
`slack-dispatch` (452 lines) is now invoked both by cron and by a DB trigger with a 10s throttle (added last session). `slack-inbox-watch`, `slack-pipeline-digest`, `slack-morning-digest`, `slack-evening-digest`, `slack-payout-post` each format their own blocks - `_shared/slackBlocks.ts` exists but is not consistently used. Risk: duplicate or missing notifications when the trigger fires while the cron is mid-run.

### R8. Frontend data layer (no boundary)
162 `supabase.from(...)` calls across 60 components/pages. 103 `invalidateQueries`. `crmKeys` in `crmData.ts` is the only structured key namespace; everything else uses ad-hoc string arrays. Stats pages that "don't refresh" are almost always missing an invalidation in one of the 60 callsites.

### R9. `fetchCrmBase` does a 50k-row scan for replied flags
`src/lib/crmData.ts:140-148` pulls up to 50,000 conversation ids with `last_inbound_at not null` on every CRM mount, just to build a Set. This is the single largest payload the frontend pulls. Will degrade visibly past ~10-20k conversations.

### R10. `useRealtimeTable` + local state pattern
`CRM.tsx` and `Pipeline.tsx` mutate local arrays from realtime payloads while react-query holds a parallel cache. There is no merge strategy when the cached fetch returns a row that realtime already mutated. Operators occasionally see a card "snap back" - this is why.

## 3. Quick Wins (1-2 hours each)

- **Delete the 3 local `normalizePhone` copies**, import `_shared/phone.ts` everywhere. Single file change in `whatsapp-webhook`, `campaigns`, and align `src/lib/audienceData.ts` behavior. Immediately closes the 49-prefix drift class of bugs.
- **Extract `fetchCrmBase`'s replied-set query** into a server-side view or a `select count` + boolean column, dropping the 50k-id pull. 30-min change, large frontend speedup.
- **Add a single `data/` module per domain** (`data/conversations.ts`, `data/deals.ts`, `data/campaigns.ts`) that wraps the existing supabase calls. Don't rewrite pages yet - just funnel new code through them and freeze `supabase.from()` in pages.
- **Standardize query keys.** Extend the `crmKeys` pattern to `pipelineKeys`, `campaignKeys`, `statsKeys`. Removes the "which string did I invalidate" guesswork.
- **Move the 4 inline phone-fix SQL fragments** (now in migrations + edge functions) into a `repair_phone(text, text)` SQL function. One source of truth, callable from triggers and from edge.
- **Add explicit `console.error` with action name** at every `catch` in `campaigns/index.ts`. Right now 30 try blocks share generic toasts - operators have no breadcrumb when launch silently no-ops.

## 4. Medium Cleanup / Refactor Tasks

- **Split `campaigns/index.ts`** into one folder per action: `campaigns/_router.ts` + `actions/launch.ts`, `actions/blast.ts`, `actions/templates.ts`, `actions/runtime.ts`, `actions/retry.ts`. Share `_shared/template.ts` and `_shared/phone.ts`. This is the single most leveraged backend refactor.
- **Extract `CRM.tsx` into**: `CRMShell.tsx` (layout + filters), `ConversationList.tsx`, `ConversationView.tsx` (messages + composer), `useConversationsQuery`, `useConversationRealtime` (with proper react-query merge). Cuts 22 useState to ~6 per component.
- **Extract `Pipeline.tsx` into**: `PipelineBoard.tsx` (DnD only), `DealCard.tsx`, `StageColumn.tsx`, `useDealMutations` (move/create/update/delete with consistent invalidation). Stage CRUD moves entirely to `PipelineConfigSheet`.
- **Collapse `PipelineConfigSheet` + `StageAutomationsDialog` + `PipelinesView`** into a coherent `pipeline-config/` folder with one source of truth for stage rules. Today each holds its own copy of the rule preview formatter.
- **LaunchWizard persistence.** Persist wizard step + draft into `launch_drafts` table or session storage. Today a refresh loses 20 minutes of operator work. This is operator clarity, not just code hygiene.
- **Consolidate Slack senders.** `_shared/slackBlocks.ts` should own all block formatting; the 6 slack-* functions become thin "select events + format + post" wrappers. Resolves the duplicate-notification risk from trigger+cron overlap.
- **Observability pass.** Standardize an `edgeLog(fn, action, level, fields)` helper in `_shared/`, replace the 175 ad-hoc `console.log` calls. Then `supabase--edge_function_logs` becomes actually useful for debugging launches and webhook drops.

## 5. Do NOT Touch Yet

- **`supabase/functions/_shared/template.ts`** - it's working, well-shaped, and feeds 3 functions. Leave it.
- **`useRealtimeTable.ts`** - the hook itself is fine; the problem is how `CRM.tsx`/`Pipeline.tsx` consume it. Fix the callers, not the hook.
- **`crmData.ts` shape** - the `crmKeys` namespace is the right pattern to copy outward. Don't refactor it, extend it.
- **`whatsapp-webhook/index.ts handleInbound`** (lines 48-535) - long, but it's a single linear pipeline with real edge cases (country prefix repair, recent-pipeline lookup, status mapping). Splitting it prematurely will lose context. Revisit only after `_shared/phone.ts` is the sole normalizer.
- **`audience-ai-prepare`, `classify-replies`, `ops-assistant`** - AI-touching functions are fine in size and isolated.
- **`supabase/integrations/supabase/types.ts`** - auto-generated, never edit.
- **All landing/marketing pages** (`Index`, `Apply`, `Book`, `WhatsAppApply`, `SellerLeads*`, `BrandAssets`, `Privacy`, `Terms`) - out of CRM scope, no need to refactor for this audit.

## 6. Recommended Implementation Order

Each step is independently shippable and unblocks the next.

```text
Step 1  Phone normalization unification           (quick win, foundational)
Step 2  Standardize query keys + add data/ wrappers (no behavior change)
Step 3  Replace fetchCrmBase replied-set scan     (visible perf win)
Step 4  Split campaigns/index.ts into actions/    (highest backend leverage)
Step 5  Edge logging helper + audit campaigns/wb  (observability before next split)
Step 6  Split CRM.tsx (list / view / hooks)      
Step 7  Split Pipeline.tsx + consolidate config sheet/automations
Step 8  LaunchWizard persistence + split into steps
Step 9  Slack consolidation + dedupe trigger/cron
```

Steps 1-3 are ~1 day total and remove most of the "stale data / wrong number" complaint class.
Steps 4-5 are ~2-3 days and make the backend debuggable.
Steps 6-9 are the real architectural work, ~1-2 weeks, and should be done in that order because each later step depends on the data-layer boundary established in step 2.
