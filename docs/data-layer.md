# Data layer rule

**No `supabase.from(...)` outside `src/lib/`.**

UI components and pages should never call `supabase.from(...)` directly.
Every read/write goes through a typed helper in `src/lib/<domain>.ts`.

## Why

1. **Invalidation drift.** Mutations scattered across pages mean nobody knows
   which `queryKey` to invalidate. Centralizing the mutation also centralizes
   the cache update.
2. **RLS auditability.** Easy to grep every table touch in one place.
3. **Testability.** Pure functions are testable; components calling
   `supabase` directly are not.
4. **Silent-failure prevention.** Helpers in `src/lib/` route errors through
   `@/lib/logger` so failed `update`s don't disappear into a rejected promise
   nobody awaits. (This is exactly the class of bug that ate the Sophias
   inbox email.)

## Where helpers live

```
src/lib/inbox.ts         - conversations + messages mutations
src/lib/pipelines.ts     - pipelines + stages CRUD
src/lib/deals.ts         - deal CRUD
src/lib/crmData.ts       - aggregated read helpers (fetchCrmBase, etc.)
src/lib/campaigns.ts     - campaign helpers
src/lib/workspaceMembers.ts
src/lib/portfolioMetrics.ts
...
```

## Query keys

All `queryKey` tuples live in `src/lib/queryKeys.ts`. Never inline a string
key in a page/component — import the builder.

## Refetch intervals

Use `visibleRefetchInterval(ms)` from `@/lib/visibleRefetchInterval` and
set `refetchIntervalInBackground: false`. Never pass a bare `30_000` — it
will keep firing in background tabs.

## Error logging

`@/lib/logger` exposes `logError(scope, err, context?)`. The QueryClient
already routes all `useQuery` / `useMutation` failures through it via
`QueryCache` / `MutationCache`. For ad-hoc `try/catch` in components,
import `logError` and call it before re-throwing or toast-ing.

## Migration policy

Existing pages that violate this rule (PartnerDetail, PipelineConfigSheet,
FleetRegistry, FinancePartnerDetail) are tracked in `.lovable/plan.md`
Phase D. **Don't add new violations.**
