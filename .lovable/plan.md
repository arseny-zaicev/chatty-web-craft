
# CRM optimization & stability audit

## 1. Executive summary

The app is functionally rich but architecturally weighted toward a handful of god-components. Routing is already lazy and React Query is centralized (`src/lib/queryKeys.ts`), which is good. However:

- **6 files carry most of the risk**: `LaunchWizard.tsx` (2045 LOC), `PipelineConfigSheet.tsx` (1816), `FleetRegistry.tsx` (1410), `CRM.tsx` (1203), `Pipeline.tsx` (1142), `WorkspaceData.tsx` (1141), plus `supabase/functions/campaigns/index.ts` (2108 LOC, 14 handlers in one file). Any of these can break the system on a small change.
- **Data-layer leakage**: pages still call `supabase.from(...)` directly. Worst offenders: `PartnerDetail` (17), `PipelineConfigSheet` (17), `FinancePartnerDetail` (11), `FleetRegistry` (9), `BusinessManagerDetail` (9). This makes invalidation, caching and RLS audit harder.
- **No client-side error tracking** (`Sentry`/`captureException` = 0 hits). `console.error` exists in 10 files only. Silent failures are likely - exactly the class that produced the Sophias missing-email bug.
- **Initial CRM load is heavy**: `fetchCrmBase` pulls up to 1000 conversations + 5000 deals + 2000 stages + numbers in parallel on every mount. No virtualization on the rendered list.
- **Polling vs visibility**: most `refetchInterval` (15s in PipelineConfigSheet, 30s in PartnerDetail/WorkspaceCampaigns, 60s in OpsPerformance) keep firing in background tabs. Only `AdminPanel` guards with `document.visibilityState`.
- **Pipeline realtime is over-broad**: subscribes to the entire `conversations` table for the workspace just to refresh assignee/responder fields.

Health rating: **B-**. Nothing catastrophic, but several seams are exactly where the next bug will land.

---

## 2. Top problems (with file refs and impact)

### P1. `CRM.tsx` (1203 LOC, 9 useEffect, 20+ useState, no virtualization)
Mixed concerns: auth gating, conversation list, message list, draft composer, realtime, pipeline filtering. Server data is copied into local `useState` (`conversations`, `messages`, `numbers`) and then mutated by realtime callbacks - which means React Query cache and local state can diverge. Re-renders the whole 1000-item conversation list on every keystroke in the search box.
Impact: high latency on big workspaces, hard to add features safely, source of subtle inbox bugs.

### P2. `fetchCrmBase` in `src/lib/crmData.ts`
Always fetches `.limit(1000)` conversations + `.limit(5000)` deals + `.limit(2000)` stages even when the user only needs the inbox. Stage/deal join is done client-side just to derive `stage_type`.
Impact: slow first paint on busy workspaces, wasteful bandwidth.

### P3. `supabase/functions/campaigns/index.ts` (2108 LOC, one file)
`launchCampaign`, `processQueue`, `blastCampaign`, `setCampaignStatus`, `redistributeCampaign`, `retryFailedRecipients`, `prepareCampaign`, `killSwitch`, `runtimeStatus` all live in one module. Shared helpers, shared timezone math, shared mutation paths. Any change to the queue processor risks the launch path.
Impact: highest blast radius in the system - matches the class of bug that ate the inbox message.

### P4. Data-layer leakage in admin/workspace pages
`PartnerDetail.tsx`: 17 direct `supabase.from(...)` + 30 `useQuery` + 10 `invalidateQueries`. Same pattern in `PipelineConfigSheet.tsx`, `FleetRegistry.tsx`. Query keys are partially inlined, partially from `queryKeys.ts`.
Impact: invalidation drift (mutation in one place doesn't refresh another), RLS regressions hard to audit, tests impossible.

### P5. Background polling without visibility guards
`PipelineConfigSheet` refetches every 15s, `PartnerDetail` and `WorkspaceCampaigns` every 30s, `OpsPerformance` every 60s. Only `AdminPanel` checks `document.visibilityState`. Idle tabs still burn Postgres connections.
Impact: needless DB load, scaling cliff comes earlier than necessary, faster Lovable Cloud compute saturation.

### P6. Pipeline realtime over-subscription
`Pipeline.tsx` subscribes to `conversations` workspace-wide for fields it only displays in deal cards. The same conversation may also be updated from CRM realtime.
Impact: duplicate work and duplicate state writes; on a 5k-conversation workspace this is a constant drip.

### P7. No client error reporting + silent catches
No Sentry, no `captureException`, very few `console.error`. Failed `supabase.from(...).update(...)` often `throw` into a Promise no one awaits. We already proved this hides real data loss (Sophias inbox).
Impact: bugs surface as user reports days later instead of as alerts.

### P8. `LaunchWizard.tsx` (2045 LOC, 15 useEffect, 27 useMemo/useCallback)
27 memoization hooks usually mean "we're firefighting renders, not preventing them". Multiple `useEffect`s feed each other. State machine is implicit.
Impact: edits here regress launch flow weekly; the most expensive surface to extend.

### P9. `whatsapp-webhook` raw-first path is good but isolated
We added raw capture, but `send-whatsapp`, `slack-dispatch`, `reconcile-messages`, `lead-dispatch` still don't have a uniform "log, alert, return 200" wrapper. The same silent-swallow class exists.
Impact: next "where did my X go" will happen on a different surface.

### P10. `PipelineConfigSheet.tsx` (1816 LOC, modal)
Renders 6+ subsections (stages, templates, automations, Zapier, sheets, sender numbers) inside one Sheet, each with its own queries. Opening the sheet kicks off 7 useQuery + the 15s poll.
Impact: opening the config sheet for one stage edit causes a spike of queries; UI feels slow.

---

## 3. Quick wins (1-2h each, ordered by ROI)

1. **Add a shared client logger** with `console.error` + Slack webhook for unexpected errors. Wrap top-level mutations and useQuery `onError`. Wire `window.addEventListener('error' | 'unhandledrejection')`. ~1h. Removes "silent failure" class instantly.
2. **Guard every `refetchInterval` with visibility**. Add one helper `useVisibilityRefetch(ms)` and replace the 4 raw intervals. ~1h. Cuts background DB load immediately.
3. **Reduce `fetchCrmBase` initial scope**: split into `fetchCrmInboxBase` (numbers + conversations) and `fetchCrmStageMap` (deals + stages) loaded only when pipeline filter is enabled. ~1h.
4. **Virtualize the CRM conversation list** with `@tanstack/react-virtual`. Only the visible chunk renders. ~1.5h. Biggest perceptible speed win.
5. **Debounce the CRM search input** (currently triggers full re-render + server search per keystroke). 200ms debounce + memoized filter. ~30m.
6. **Narrow Pipeline realtime filter**: change `conversations` subscription to `pipeline_id=eq.<selected>` and project only the fields the Pipeline view consumes. ~45m.
7. **Add an ErrorBoundary per top-level route** (already wrapped global, but per-route boundary preserves shell when one page blows up). ~30m.
8. **Move `console.error` into all unhandled catches in `src/lib/inbox.ts`, `pipelines.ts`, `deals.ts`** (currently they just `throw`). ~30m. Better blameable stack traces in browser.
9. **`whatsapp-webhook-replay` button on `whatsapp_webhook_failures`** in WebhookDLQ - we already store failures, just wire the action. ~1h. Keeps Sophias-class incidents recoverable.
10. **Add `lovable_docs--search_docs`-style README in `/docs`** documenting the data-layer rule "no `supabase.from()` outside `src/lib/`". ~30m. Prevents regressions.

---

## 4. Medium tasks (worth doing next)

1. **Extract Inbox state into a single store/hook** (`useInbox(workspaceId)`): owns conversations, active conversation, messages, draft, realtime. CRM.tsx becomes a presentational shell.
2. **Split `PipelineConfigSheet.tsx`** into 5 lazy sub-sheets (Stages, Automations, Zapier, Sheets, Senders). Each loads its own queries on tab open instead of all 7 upfront.
3. **Centralize all `supabase.from(...)` into `src/lib/<domain>.ts`** for the worst offenders only: PartnerDetail, FinancePartnerDetail, PipelineConfigSheet, FleetRegistry. Don't touch the others yet.
4. **Split `supabase/functions/campaigns/index.ts`** into `_launch.ts`, `_queue.ts`, `_status.ts`, `_prepare.ts`, `_retry.ts`. Single thin `index.ts` router. Test queue + launch in isolation.
5. **Apply the raw-first pattern to `slack-dispatch`, `send-whatsapp`, `lead-dispatch`** (same `withJobLock` + DLQ shape we built for webhook).
6. **Server-side `stage_type` join** via a Postgres view or RPC `pipeline_overview(workspace_id, pipeline_id)` returning the shape Pipeline.tsx needs. Replaces the 3-table client-side join.
7. **Introduce React Query `queryClient.setQueryDefaults`** per domain (campaigns, inbox, admin) so staleTime/refetch behavior is one-place instead of scattered.
8. **Migrate `useState` mirrors to `useQuery` cache + `setQueryData`** in CRM/Pipeline (eliminate the "two sources of truth" pattern).

---

## 5. What NOT to touch yet

- **`LaunchWizard.tsx`** - it works, it's the revenue path. Resist the urge to refactor before extracting tests; do that after the campaigns edge function is split.
- **`src/integrations/supabase/types.ts`** - auto-generated, hands off.
- **`tailwind.config.ts` / `index.css` design tokens** - not the bottleneck.
- **Public site components** (`Hero`, `Pricing`, `Testimonials`, etc.) - low risk, low ROI; ignore for this pass.
- **`AdminSubmissions.tsx`, `FormAnalyticsDashboard.tsx`** - already have logging; not on the hot path.
- **shadcn `ui/*`** - leave alone, regressions there cost more than they save.
- **Don't rewrite `campaigns` queue logic** - only physically split the file; behavior change in a separate PR.

---

## 6. Recommended implementation order (safe sequence)

```text
Phase A - Observability (no behavior change) ............ 0.5 day
  1. Shared client logger (Quick win #1, #8)
  2. ErrorBoundary per route (#7)
  3. Visibility-guarded refetch helper (#2)

Phase B - Inbox/Pipeline perf (visible to user) ......... 1 day
  4. Split fetchCrmBase + add virtualization (#3, #4)
  5. Debounce search (#5)
  6. Narrow Pipeline realtime (#6)

Phase C - DLQ hardening (matches recent incident) ....... 0.5 day
  7. Wire replay on whatsapp_webhook_failures (#9)
  8. Apply raw-first pattern to slack-dispatch + send-whatsapp (Medium #5)

Phase D - Structural (riskier, do after A-C land) ....... 1-2 days
  9. Centralize supabase.from for the 4 worst pages (Medium #3)
  10. Split campaigns/index.ts into modules (Medium #4)
  11. Split PipelineConfigSheet into lazy sub-sheets (Medium #2)

Phase E - Optional follow-ups (only if metrics justify)
  12. Inbox state hook (Medium #1)
  13. Server-side pipeline_overview RPC (Medium #6)
  14. Query defaults per domain (Medium #7)
```

Each phase ships independently. Phase A is pure safety net - do it even if nothing else proceeds. Phase B is where the user will feel the speedup. Phase D is where bugs hide if rushed - keep it last and behind feature-flag-free, mechanical refactors only.

Awaiting your review before I implement Phase A.
