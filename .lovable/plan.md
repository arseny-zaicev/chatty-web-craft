# Performance audit — Iskra CRM

Read-only audit. Focus: duplicate fetches, N+1, re-renders, list size, lazy loading, realtime/polling, bundle.

---

## Headline diagnosis

The "sluggish" feel comes from a small number of structural choices, in this order of impact:

1. **The Inbox loads every conversation in the workspace and then pulls every inbound message for those conversations** in a second round-trip — on every mount. Payload grows linearly with workspace age.
2. **Realtime channels in Inbox and Pipeline subscribe to every row of `conversations`/`deals` globally** (no workspace filter). Each event from any other client also re-renders the page, and because the channel deps include state that changes on those events, the channel **tears down and re-subscribes** under load.
3. **AdminPanel polls `fetchPortfolioSnapshot` every 60 s**, which reads *all* conversations + *all* today's messages across the entire org. This runs continuously while a manager keeps the tab open.
4. **Large lists (Inbox conversation list, Pipeline cards, Fleet table) render every row** — no virtualization, no pagination, no `React.memo` on row components.
5. **Initial bundle ships `xlsx`, `html2canvas`, `jspdf`, `framer-motion`, `recharts` even on routes that do not use them**. Several PNG assets in `public/` and `src/assets` are 1–4 MB.
6. **State is duplicated** between react-query cache and local `useState` in CRM/Pipeline, so each realtime tick triggers two updates plus a `queryClient.setQueryData` that **overwrites** the cached object shape and discards `conversationStageType` / `repliedConversationIds` maps.

---

## P0 — Ship first, biggest user-visible wins

### P0.1 — Inbox base query: paginate + remove the inbound-messages N+1
- **File:** `src/lib/crmData.ts → fetchCrmBase`
- **Now:** `select * from conversations` (no limit, no pagination) + a second `select conversation_id from messages where direction='inbound' and conversation_id in (…all of them…)` purely to compute a "Replied" badge.
- **Why slow:** payload + roundtrip grow with conversation count. On a workspace with 5 000 conversations this is two large queries on every Inbox mount.
- **Fix direction:** (a) cap the conversation list to the most recent 200 with `.range()` + cursor pagination on scroll; (b) replace the second query with a denormalised `has_inbound` boolean (or `last_inbound_at`) on `conversations`, maintained by the existing webhook trigger.
- **Impact:** Inbox open time drops from O(N) to O(1); no more big "in-list" query.

### P0.2 — Scope realtime subscriptions to the workspace + stop re-subscribing
- **Files:** `src/pages/CRM.tsx`, `src/pages/Pipeline.tsx`, `src/hooks/useRealtimeTable.ts`
- **Now:** `useRealtimeTable({ channel: "crm-conversations", table: "conversations" })` — no `filter`, so Postgres streams **every** row change for every workspace. The deps array is `[numbers, queryClient, workspaceId]`; `numbers` changes on every refetch, which causes the channel to tear down / re-subscribe (expensive, and drops in-flight events).
- **Fix direction:** pass `filter: workspace_id=eq.${workspaceId}` (and the same for `pipeline-deals`/`pipeline-conversations`); remove `numbers`/`queryClient` from the dep list and use refs inside the callback instead so the channel persists for the page's lifetime.
- **Impact:** ~10× fewer wake-ups for managers running multiple workspaces; no more lost realtime events; CPU drops noticeably while idle.

### P0.3 — Throttle/scope the Portfolio snapshot
- **File:** `src/lib/portfolioMetrics.ts → fetchPortfolioSnapshot`, called from `AdminPanel.tsx` with `refetchInterval: 60_000`.
- **Now:** Reads all conversations + all today's messages across every workspace, every minute. Heaviest single query in the app.
- **Fix direction:**
  - Move the aggregation server-side: a Postgres view or `rpc("portfolio_snapshot")` that returns one row per workspace already aggregated.
  - Until that exists: lower polling to 5 minutes, only refetch on tab focus, and pause when the tab is hidden (`document.visibilityState`).
- **Impact:** removes the steady-state DB load that slows everyone (including the inbox tab in another window) and shrinks the admin payload from MBs to KBs.

### P0.4 — Cap message history on conversation open
- **File:** `src/lib/inbox.ts → fetchConversationMessages`
- **Now:** `select … from messages where conversation_id=… order by created_at asc` — no limit. Long-running conversations (months of broadcasts + replies) load thousands of rows on every click.
- **Fix direction:** load the most recent ~50 with `order desc + limit + reverse`, then "Load earlier" on scroll-up.
- **Impact:** message-pane open latency becomes constant, not "longer the older the chat".

---

## P1 — Visible after P0 lands

### P1.1 — Virtualize the three big lists
- **Inbox conversation list** (`src/pages/CRM.tsx`), **Pipeline cards** (`src/pages/Pipeline.tsx`), **Fleet Registry table** (`src/pages/admin/FleetRegistry.tsx`). Each `.map()`s the entire array into the DOM. With >300 items the list scrolls jankily; with >1 000 it freezes the main thread on filter/sort.
- **Fix direction:** `@tanstack/react-virtual` (already paired well with TanStack Query); keep current markup, just wrap the scroll container.
- **Impact:** smooth scroll regardless of size; sort/filter cost drops to visible window only.

### P1.2 — Stop duplicating server state into local state
- **Files:** `CRM.tsx` (`setConversations`), `Pipeline.tsx` (`setDeals`, `setConversations`).
- **Now:** Data lives in both `useQuery` cache *and* local `useState`. Realtime handler updates state and *also* calls `queryClient.setQueryData(crmKeys.base(...), { numbers, conversations: next })`, **dropping** `conversationStageType` and `repliedConversationIds` keys → next refetch sees a malformed cache.
- **Fix direction:** keep the source of truth in the query cache; use `setQueryData(key, (old) => ({ ...old, conversations: merge(old, payload) }))`; derive everything via `useMemo` on `data`. Delete the parallel `useState` arrays.
- **Impact:** half the re-render passes per realtime event; no more "stale stage type" bugs after a realtime burst.

### P1.3 — Memoize row components and heavy derivations
- Inbox `ConversationRow`, Pipeline `DealCard`, Fleet `Row` are inline JSX inside the parent's render. Every parent setState (filter, search keystroke, realtime tick) re-renders the entire list.
- **Fix direction:** extract row components and wrap in `React.memo` with a shallow comparator on the row id + a couple of presentation props. Memoize `dealsByStage`, `sorted`, `negativeCount`, `repliedCount` already done — keep that pattern and extend.
- **Impact:** typing in the search box no longer re-renders 500 rows.

### P1.4 — Lazy-load heavy libraries
- `xlsx` (~600 KB), `html2canvas` (~200 KB), `jspdf` (~300 KB) are imported statically from `WorkspaceData.tsx`, `lib/audienceData.ts`, `AISeoReport.tsx`. Even though those pages are route-lazy, **the page chunk itself becomes huge** and parse/eval blocks the UI when first opened.
- `framer-motion` (~150 KB) is only used in 1 file.
- `recharts` (~400 KB) only used in `components/ui/chart.tsx`.
- **Fix direction:** convert these to dynamic `await import(...)` inside the action handlers (`onClick={() => import("xlsx").then(...)}`). Same for `html2canvas` / `jspdf` (only needed when "Export PDF" is clicked).
- **Impact:** the first paint of WorkspaceData / Inbox drops by 1–2 MB of JS to download + parse.

### P1.5 — Replace the per-message `extraSenders` profile lookup
- **File:** `src/pages/CRM.tsx` lines ~110-138.
- **Now:** Every time `messages` updates, scans for unknown `sent_by_user_id` and runs a `profiles` `.in("user_id", …)` query, then merges into a Map kept in `useState`. On a busy thread this fires multiple times.
- **Fix direction:** prefetch admin/manager profiles once per workspace (already done for members) and union them into `memberById`. If the user really isn't a member, fall back to "Iskra team". Eliminates 1 round-trip per new responder seen.

---

## P2 — Polish & infra

### P2.1 — Asset weight
| File | Size | Suggestion |
|---|---|---|
| `public/iskra-og-v3.png` | 2.4 MB | Convert to optimized JPG/webp; OG only needs ~150 KB |
| `public/videos/*` | 11 MB | Confirm any are eagerly fetched; otherwise `preload="none"` |
| `src/assets/founder/arsenijs-zaicevs.png` | 2.3 MB | Convert to webp; provide srcset 480/960/1440 |
| `src/assets/logo/iskra-from-pdf-{1,4,5,7}.png` | 1–1.4 MB each | Brand-asset gallery only — should be on-demand or pre-compressed |
| `public/iskra-favicon*.png` | 34 KB | Replace with `iskra-favicon.svg` already present |

### P2.2 — Pipeline.tsx assigneeFilter eslint-disabled
The `useMemo` for `visibleDeals` has an `eslint-disable react-hooks/exhaustive-deps`. `convById` is mutated each render; the deps lie. Fix the deps and the recomputation will be correct *and* cheaper.

### P2.3 — Heartbeat / clocks
`useHeartbeat` every 60 s + `OpsLive` setInterval 1 s for a clock + `LaunchWizard` 30 s tick + `AISeoReport` poll. Each fine in isolation, but together with realtime they create constant churn. Centralize with `requestIdleCallback` and skip when `document.hidden`.

### P2.4 — `react-helmet-async` per-page
Every lazy page imports its own Helmet. Fine, but verify there is exactly one `HelmetProvider` (App.tsx — ✅) and that titles don't fight inside transitions.

### P2.5 — `lovable-tagger` in production build
`devDependencies` includes `lovable-tagger`. Confirm it is dev-only in `vite.config.ts` (typical setup is `mode === "development" && componentTagger()`). If it ever runs in production it will inflate bundle and slow render.

### P2.6 — Suspense fallbacks
Route fallback `IskraLoader` runs an animation and `setInterval` of its own. Cheap, but consider a static skeleton for first paint.

---

## What to implement first (recommended order)

1. **P0.2** — add workspace `filter` and stable deps to `useRealtimeTable` calls. **One-day change, biggest perceived smoothness win**, especially for Iskra (multiple workspaces open).
2. **P0.1 + P0.4** — cap conversations to 200 + cap messages to 50 with cursor pagination, drop the inbound N+1 (or replace with `last_inbound_at` column). Inbox open time drops dramatically.
3. **P0.3** — slow the AdminPanel poll and gate it on tab visibility; plan a server-side aggregator next.
4. **P1.4** — convert `xlsx`/`html2canvas`/`jspdf` to dynamic imports. Free 1–2 MB of initial JS for free.
5. **P1.1 + P1.3** — virtualize Inbox + Pipeline + Fleet, memoize their row components.
6. **P1.2** — collapse duplicate server-state into the query cache.
7. **P1.5** — fold `extraSenders` into `memberById`.
8. **P2** items as time allows.

---

## Expected user impact

- **Inbox open**: p95 from "few seconds + visible jank" → near-instant on workspaces of any size.
- **Background CPU/network** while Inbox/Admin tabs are open: roughly **−70 %** from realtime scoping + poll throttling alone.
- **Initial app load** (first time hitting `/ws/.../data` or `/admin`): **−1 to −2 MB** of JS, faster Time-to-Interactive.
- **Sidebar / Pipeline scrolling**: 60 fps regardless of list size after virtualization + memoization.
- **Realtime correctness**: no more lost events from channel re-subscriptions and no more dropped cache fields.

I have NOT made any code changes — this is a read-only audit. Tell me which slice to implement first and I'll start with concrete edits.