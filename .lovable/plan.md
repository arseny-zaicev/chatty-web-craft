# Codebase audit - separation of concerns & maintainability

Scope: `src/pages/**`, `src/components/**`, `src/lib/**`, `src/hooks/**`. No code changes.

---

## 1. Headline findings

The product layers (UI / data access / domain rules / auth) are **only partially separated**. A small number of pages have grown into "god files" that mix five concerns at once: query state, mutations, raw Supabase calls, auth/session handling, realtime channels, and presentation. Helper modules in `src/lib` are good in spirit but inconsistently used - many pages bypass them and call `supabase.from(...)` directly.

Worst offenders (LOC, mixed concerns):

| File | LOC | Concerns mixed |
|---|---|---|
| `src/pages/workspace/LaunchWizard.tsx` | 1249 | wizard UI + CSV parsing + scheduling math + audience reservation + 2 mutations + presets |
| `src/pages/admin/FleetRegistry.tsx` | 1006 | inventory table + 14 supabase calls + CRUD dialogs + auth guard |
| `src/pages/CRM.tsx` | 931 | inbox UI + messages query + realtime + auth + send + star/pin/assignee + sender resolution |
| `src/pages/Pipeline.tsx` | 926 | kanban + DnD + deal CRUD + auth + realtime + conversation linking |
| `src/pages/workspace/WorkspaceData.tsx` | 858 | upload + parse + AI-prep + validation + table + dialogs |
| `src/components/AdminSubmissions.tsx` | 640 | list + filters + status mutations + export - belongs under `pages/admin` |

---

## 2. Logic misplaced inside UI components

These are domain/data concerns that should not live inside a `.tsx` page:

1. **CRM.tsx** - direct `supabase.from("conversations").update(...)` for star/pin/unread/markRead, direct `messages` fetch+pagination, manual realtime channel wiring, sender resolution merging an "extraSenders" map. Should be a `useInbox(workspaceId)` hook + `inboxMutations.ts` lib.
2. **Pipeline.tsx** - deal create/delete/move SQL inline, conversation linking SQL inline, DnD wired directly to supabase. Should be `useDeals` + `dealMutations.ts`.
3. **LaunchWizard.tsx** - the wizard owns: campaign-name building, scheduler maths (uniform/poisson), per-country pool selection, audience reservation, draft persistence, mapping persistence, AI prompt building. A lot of this is half-extracted into `lib/launchData.ts` but the wizard still re-implements scheduling and the launch mutation contains business rules (sibling naming, routing).
4. **WorkspaceData.tsx** - mixes audience batch CRUD with prep-profile validation and AI prompt rendering. Three separate domains in one file.
5. **FleetRegistry.tsx** - an admin inventory table doing 14 raw supabase queries including JOIN-style aggregation in JS. No `lib/fleet.ts` exists.
6. **WorkspaceLayout.tsx** - auth+membership guard logic embedded in the layout; should be a route guard component / hook (`useRequireWorkspaceAccess`).
7. **Forms** (`SellerLeadsForm`, `WhatsAppOutreachForm`, `QualificationForm`, `BMAccessForm`, `AdminSubmissions`) - each calls `supabase.from(...)` for submissions; no shared `submissions` repository.

---

## 3. Overly coupled / cross-cutting hotspots

- **`lib/crmData.ts` is a god-lib**: it holds inbox base, pipeline base, campaign base, stage seeding, and friendly-label helpers. CRM, Pipeline, Campaigns, and Overview all depend on it. A change to one query forces re-checks across four pages.
- **`lib/launchData.ts`** mixes pure helpers (`parseCsv`, `geoFromPhone`, `groupLogicalTemplates`) with persistence (`saveAudience`, `loadMapping` using `localStorage`) and remote queries (`fetchLaunchEssentials`, `fetchCampaignSummaries`). Three different responsibilities, one module.
- **Auth/session boilerplate is duplicated** in ~14 files (`CRM`, `Pipeline`, `WorkspaceLayout`, `AdminPanel`, `AISeoReport`, `PortalAuth`, `ResetPassword`, `AcceptInvite`, `OpsLive`, `FleetRegistry`, `FleetAnalytics`, `AdminMfaSetup/Verify`, `AuthCacheReset`). Each builds its own `getSession + onAuthStateChange + signOut` pattern.
- **Realtime channel setup** is repeated ad-hoc in CRM and Pipeline with manual `supabase.removeChannel` cleanup - no `useRealtimeTable(table, filter)` abstraction.
- **`splitBase` (sibling-campaign grouping)** is implemented twice: `WorkspaceCampaigns.tsx` and `lib/portfolioMetrics.ts`. They are slightly different signatures - bug-prone.
- **`geoFromPhone`** lives in `launchData.ts` but is used by `FleetRegistry`, `NumbersInventory`, and `LaunchWizard` - it is a generic phone util, not "launch" data.
- **Workspace context** is passed through `useOutletContext` and *also* re-fetched via `fetchWorkspaces` inside several pages - two sources of truth for the active workspace.

---

## 4. Duplicated logic / missing abstractions

| Pattern | Where | What's missing |
|---|---|---|
| `getSession` + `onAuthStateChange` + signOut | 14 files | `useAuthSession()` + `<RequireAuth role>` route guard |
| Workspace membership check | `WorkspaceLayout`, admin pages | `useRequireWorkspaceAccess(slug)` |
| `supabase.channel(...)` lifecycle | `CRM`, `Pipeline` | `useRealtimeTable(table, filter, onChange)` |
| `friendlySenderLabel` only covers numbers | `crmData.ts` | similar `friendlyMemberLabel` is in `workspaceMembers.ts` - co-locate |
| Sibling grouping (`splitBase`) | `WorkspaceCampaigns`, `portfolioMetrics` | move to `lib/campaigns.ts` |
| Phone normalization | `audienceData.normalizePhone` + `launchData.geoFromPhone` + ad-hoc cleaning in `FleetRegistry` | `lib/phone.ts` |
| `formatDistanceToNow` direct usage | 8+ files | small `lib/datetime.ts` (`relative(date)`) |
| Form submission via supabase.from | 5 form components | `lib/submissions.ts` |
| Stage-type lookup (`open/won/lost`) | `crmData`, `portfolioMetrics`, `Pipeline` | encapsulate in `lib/pipelines.ts` |
| `localStorage` mapping/audience persistence | `launchData.ts` | `lib/launchDrafts.ts` (separate from network) |

There is **no `src/features/` or domain folder structure**: contacts, companies, inbox, campaigns, tasks, pipeline are not modules - they are scattered between `pages/`, `components/workspace/`, and `lib/`.

---

## 5. Files / modules that should be split

Concrete proposals:

- **`pages/CRM.tsx` (931)** -> `features/inbox/`
  - `pages/InboxPage.tsx` (layout + URL state)
  - `hooks/useInbox.ts` (lists, filters, sort)
  - `hooks/useConversation.ts` (active conv + messages + realtime)
  - `lib/inbox.ts` (mutations: star/pin/markRead/assign/touchResponder)
  - `components/inbox/ConversationList.tsx`, `MessageThread.tsx`, `Composer.tsx`

- **`pages/Pipeline.tsx` (926)** -> `features/pipeline/`
  - `PipelinePage.tsx`, `KanbanBoard.tsx`, `DealCard.tsx`, `DealDetailSheet.tsx`
  - `hooks/usePipelineBoard.ts`, `lib/deals.ts` (CRUD + DnD reorder)
  - move stage seeding to `lib/pipelines.ts` (already exists)

- **`pages/workspace/LaunchWizard.tsx` (1249)** -> `features/launch/`
  - `LaunchWizardPage.tsx` (orchestrator)
  - `steps/{TypeStep,AudienceStep,TemplateStep,ScheduleStep,ReviewStep}.tsx`
  - `lib/scheduler.ts` (uniform/poisson + COUNTRY_TZ map)
  - `lib/launchMutation.ts` (the launch mutation + sibling naming)
  - keep pure helpers in `lib/launch/` and remove `localStorage` from `launchData.ts`

- **`pages/admin/FleetRegistry.tsx` (1006)** -> 
  - `lib/fleet.ts` (fetchFleet, mutations, aggregation)
  - `FleetRegistryPage.tsx`, `FleetRow.tsx`, `FleetEditDialog.tsx`, `FleetCreateDialog.tsx`

- **`pages/workspace/WorkspaceData.tsx` (858)** -> 
  - `AudiencesView.tsx` (batches list + upload)
  - `BatchDetailSheet.tsx`
  - `PrepProfileEditor.tsx` (already half-extracted in `lib/prepProfiles`)

- **`lib/crmData.ts` (255)** -> split into `lib/inbox.ts`, `lib/pipelineBoard.ts`, `lib/campaignsData.ts`. Keep only shared types in `lib/crmTypes.ts`.

- **`lib/launchData.ts`** -> `lib/launch/{api.ts, csv.ts, scheduler.ts, drafts.ts, naming.ts}` and move `geoFromPhone` to `lib/phone.ts`.

- **`components/AdminSubmissions.tsx` (640)** -> move to `pages/admin/Submissions/` and split list / detail / actions.

---

## 6. Prioritized refactors

### P0 - high pain, blocks safe iteration
1. **Extract `useAuthSession` + `<RequireAuth>` and `useRequireWorkspaceAccess`**. Delete the duplicated `getSession/onAuthStateChange/signOut` blocks in 14 files. This is the single biggest risk surface (auth bugs already happened: cross-account leak).
2. **Carve `pages/CRM.tsx` into `features/inbox/`** with `useInbox`, `useConversation`, and `lib/inbox.ts` mutations. Stop calling `supabase.from("conversations|messages")` from a TSX file.
3. **Carve `pages/Pipeline.tsx` into `features/pipeline/`** with `lib/deals.ts` and a `useRealtimeTable` hook shared with inbox.
4. **De-duplicate `splitBase` and centralize sibling-campaign rules in `lib/campaigns.ts`**. This is product-critical (the user just hit a related bug) and currently lives in two places.

### P1 - structural debt, slowing every new feature
5. **Re-organize into `src/features/{inbox,pipeline,campaigns,launch,audiences,fleet,team,brand}/`**. Keep `components/ui` and `components/workspace` for cross-feature pieces only.
6. **Split `LaunchWizard` into step components + `lib/launch/scheduler.ts` + `lib/launch/launchMutation.ts`**. The 1249-line file is the single most expensive file to change.
7. **Split `lib/crmData.ts` and `lib/launchData.ts`** along the lines above; move `geoFromPhone`, `normalizePhone` to `lib/phone.ts`.
8. **`useRealtimeTable(table, filter, onChange)` hook** to remove channel boilerplate.
9. **Submissions repository** (`lib/submissions.ts`) for the 5 form components.

### P2 - quality of life
10. **`lib/datetime.ts`** wrapping `formatDistanceToNow` so we can change defaults globally.
11. **Move `AdminSubmissions` and `admin/WebhookHealth` under `pages/admin/`** and out of `components/`.
12. **Split `FleetRegistry.tsx`** into page + dialogs + `lib/fleet.ts`.
13. **Split `WorkspaceData.tsx`** into Audiences vs PrepProfiles tabs at the file level.
14. **Co-locate `friendlySenderLabel` and `friendlyMemberLabel`** in `lib/labels.ts`; one file for "how we display people/numbers".
15. **Single source of truth for active workspace** (context, not refetched per page).

---

## 7. What is already healthy (keep it)

- `lib/workspaceRole.ts`, `lib/pipelines.ts`, `lib/audienceData.ts`, `lib/portfolioMetrics.ts`, `lib/prepProfiles.ts` are well-shaped boundary modules.
- Route-level role gating in `WorkspaceLayout.RoleGuardedOutlet` is a good pattern to extend.
- `useQuery` keys are namespaced (`crmKeys`, `audienceKeys`, `pipelinesKey`, `launchKeys`) - keep that convention when splitting.

---

## Suggested execution order

P0 items 1-4 can ship in one focused refactor pass (~1-2 days) and immediately reduce duplication and bug surface in the auth + inbox + pipeline flows the client uses every day. P1 items 5-9 are a follow-up sprint that converts the codebase to a feature-folder layout and unblocks the contacts/companies/tasks modules you intend to add next - those should be born inside `features/` rather than as new top-level pages.