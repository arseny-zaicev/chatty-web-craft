/**
 * Helper for react-query's `refetchInterval` that pauses polling while
 * the tab is hidden. Not a hook (no React state), just a function
 * returning the interval-resolver RQ expects.
 *
 * Usage:
 *   useQuery({
 *     queryKey: [...],
 *     queryFn: ...,
 *     refetchInterval: visibleRefetchInterval(30_000),
 *     refetchIntervalInBackground: false,
 *   });
 */
export function visibleRefetchInterval(ms: number) {
  return () => {
    if (typeof document === "undefined") return ms;
    return document.visibilityState === "hidden" ? false : ms;
  };
}
