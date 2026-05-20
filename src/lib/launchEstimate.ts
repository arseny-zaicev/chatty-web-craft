// Pure helpers extracted from LaunchWizard.tsx (structural hardening stage 1).
// No behavior change: this mirrors the original inline `capacity` memo exactly.
//
// Backend resolver mirror: per-number cap = min(perNumberQuota, windowFitCap)
// where windowFitCap = floor(windowSeconds / minGap) for paced. Instant mode
// (Blast) skips the window clamp. Keeps pre-prepare estimate consistent with
// canonical resolver output so review/launch don't diverge.

export interface CapacityInput {
  activeNumbersCount: number;
  scheduledDatesCount: number;
  scheduleMode: "now" | "scheduled" | string;
  perNumberQuota: number;
  windowStart: string;
  windowEnd: string;
  isMarketing: boolean;
  delayMin: number;
}

export function computeCapacity(input: CapacityInput): number {
  const {
    activeNumbersCount,
    scheduledDatesCount,
    scheduleMode,
    perNumberQuota,
    windowStart,
    windowEnd,
    isMarketing,
    delayMin,
  } = input;
  const numbers = Math.max(1, activeNumbersCount);
  const days = scheduleMode === "scheduled" ? Math.max(1, scheduledDatesCount || 1) : 1;
  const quota = Math.max(1, perNumberQuota);
  const [sh, sm] = (windowStart || "09:00").split(":").map(Number);
  const [eh, em] = (windowEnd || "18:00").split(":").map(Number);
  const windowSeconds = Math.max(60, ((eh * 60 + em) - (sh * 60 + sm)) * 60);
  const minGap = isMarketing ? 1 : Math.max(1, delayMin || 1);
  const windowFitCap = isMarketing ? quota : Math.max(1, Math.floor(windowSeconds / minGap));
  const perNumberCap = Math.min(quota, windowFitCap);
  return numbers * perNumberCap * days;
}
