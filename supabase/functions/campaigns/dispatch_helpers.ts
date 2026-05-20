// Pure decision helpers for the marketing_instant dispatch system.
// Extracted so they can be unit-tested deterministically without
// hitting Postgres or any provider. The runtime in index.ts mirrors
// the same rules; tests here lock those rules in.

export type DispatchMode = "paced" | "marketing_instant";

export interface SnapshotInput {
  numberIds: string[];
  templateIds: string[];
  audienceCount: number;
  windowStart: string;
  windowEnd: string;
  perNumberQuota: number;
  maxInflightPerNumber: number;
  maxInflightPerCampaign: number;
}

export async function computeSnapshotSignature(input: SnapshotInput): Promise<string> {
  const sorted = {
    n: [...input.numberIds].sort(),
    t: [...input.templateIds].sort(),
    a: input.audienceCount,
    ws: input.windowStart,
    we: input.windowEnd,
    q: input.perNumberQuota,
    in: input.maxInflightPerNumber,
    ic: input.maxInflightPerCampaign,
  };
  const txt = JSON.stringify(sorted);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return "sha256:" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Per-number floor between consecutive sends.
// marketing_instant removes the artificial 1s (marketing) / 90s (utility)
// floor and relies on inflight caps + provider backoff.
export function decidePerNumberFloorSec(mode: DispatchMode, isUtility: boolean): number {
  if (mode === "marketing_instant") return 0;
  return isUtility ? 90 : 1;
}

export interface LaunchDecisionInput {
  mode: DispatchMode;
  killSwitchAt: string | null;
  preparedAt: string | null;
  preparedExpiresAt: string | null;
  preparedSignature: string | null;
  requestedSignature: string;
  instantGlobalEnabled: boolean;
  now?: number;
}

export interface Decision {
  ok: boolean;
  code?: "kill_switch_on" | "must_prepare" | "stale_snapshot" | "signature_mismatch" | "instant_mode_disabled";
}

export function decideLaunchAllowed(i: LaunchDecisionInput): Decision {
  const now = i.now ?? Date.now();
  if (i.killSwitchAt) return { ok: false, code: "kill_switch_on" };
  if (i.mode === "marketing_instant" && !i.instantGlobalEnabled) return { ok: false, code: "instant_mode_disabled" };
  if (!i.preparedAt || !i.preparedExpiresAt) return { ok: false, code: "must_prepare" };
  if (new Date(i.preparedExpiresAt).getTime() < now) return { ok: false, code: "stale_snapshot" };
  if (i.preparedSignature !== i.requestedSignature) return { ok: false, code: "signature_mismatch" };
  return { ok: true };
}

export interface DispatchableInput {
  mode: DispatchMode;
  pausedAt: string | null;
  backoffUntil: string | null;
  dailySent: number;
  dailyCap: number;
  inflight: number;
  maxInflight: number;
  campaignInflight: number;
  campaignMaxInflight: number;
  inWindow: boolean;
  killSwitchAt: string | null;
  instantGlobalEnabled: boolean;
  now?: number;
}

export type IdleReason =
  | "killed"
  | "instant_globally_disabled"
  | "sender_paused"
  | "in_provider_backoff"
  | "daily_cap_reached"
  | "outside_window"
  | "inflight_cap_number"
  | "inflight_cap_campaign";

export function decideCanDispatch(i: DispatchableInput): { ok: true } | { ok: false; reason: IdleReason } {
  const now = i.now ?? Date.now();
  if (i.killSwitchAt) return { ok: false, reason: "killed" };
  if (i.mode === "marketing_instant" && !i.instantGlobalEnabled) return { ok: false, reason: "instant_globally_disabled" };
  if (i.pausedAt) return { ok: false, reason: "sender_paused" };
  if (i.backoffUntil && new Date(i.backoffUntil).getTime() > now) return { ok: false, reason: "in_provider_backoff" };
  if (i.dailySent >= i.dailyCap) return { ok: false, reason: "daily_cap_reached" };
  if (!i.inWindow) return { ok: false, reason: "outside_window" };
  if (i.inflight >= i.maxInflight) return { ok: false, reason: "inflight_cap_number" };
  if (i.campaignInflight >= i.campaignMaxInflight) return { ok: false, reason: "inflight_cap_campaign" };
  return { ok: true };
}

// Provider backoff for HTTP 429/5xx. Honors Retry-After (seconds), otherwise
// uses exponential backoff with a 60-minute ceiling.
export function decideBackoffSec(status: number, retryAfterSec: number | null, attempts: number): number | null {
  if (status !== 429 && (status < 500 || status >= 600)) return null;
  if (retryAfterSec && retryAfterSec > 0) return Math.min(retryAfterSec, 3600);
  const exp = Math.min(3600, Math.pow(2, Math.max(0, attempts)));
  return exp;
}
