/**
 * Returns a value suitable for react-query's `refetchInterval` option that
 * pauses polling while the tab is hidden.
 *
 * Usage:
 *   useQuery({
 *     queryKey: [...],
 *     queryFn: ...,
 *     refetchInterval: useVisibleRefetchInterval(30_000),
 *   });
 *
 * Why: most of our polling (PartnerDetail 30s, PipelineConfigSheet 15s,
 * WorkspaceCampaigns 30s, OpsPerformance 60s) currently keeps firing in
 * background tabs and adds load to the DB for nothing.
 */
export function useVisibleRefetchInterval(ms: number): number | false | ((q: unknown) => number | false) {
  return () => {
    if (typeof document === "undefined") return ms;
    return document.visibilityState === "hidden" ? false : ms;
  };
}
