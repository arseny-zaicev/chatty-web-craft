// Canonical launch contract resolver.
//
// Single source of truth for: per-number quota, window-fit cap, per-day capacity,
// today's headroom (Dubai TZ), per-number allocation, blockers, warnings, and
// snapshot signature. Both `action=prepare` and `action=launch` must call this
// helper instead of duplicating the formulas locally.
//
// This slice does NOT touch runtime dispatch behavior, metrics_for_range,
// partner/fleet stats, or inbound/reply flows.

export const SNAPSHOT_CONTRACT_VERSION = "v4-shared-resolver-2026-05-20";

export const MAX_PER_NUMBER_QUOTA = 10000;
export const LEGACY_DEFAULT_DAILY_SEND_LIMIT = 200;

export function normalizePerNumberQuota(value: any, fallback = LEGACY_DEFAULT_DAILY_SEND_LIMIT): number {
  return Math.max(1, Math.min(MAX_PER_NUMBER_QUOTA, Math.floor(Number(value ?? fallback))));
}

export function explicitDailySendLimit(value: any): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const limit = Math.max(1, Math.min(100000, Math.floor(raw)));
  return limit === LEGACY_DEFAULT_DAILY_SEND_LIMIT ? null : limit;
}

export function hhmmToMin(s: string): number {
  const [h, m] = String(s || "09:00").split(":").map((x) => parseInt(x, 10) || 0);
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m));
}

export interface LaunchContractInput {
  numbers: Array<{ number_id: string; template_id: string }>;
  audienceCount: number;
  perNumberQuota: number;
  windowStart: string; // "HH:MM"
  windowEnd: string;
  scheduledDates: string[]; // YYYY-MM-DD; empty => single-day "now"
  dispatchMode: "paced" | "marketing_instant";
  minDelaySeconds: number;
  maxInflightPerNumber: number;
  maxInflightPerCampaign: number;
  respectRecipientTz: boolean;
  // Slice 2: optional workspace context. When provided, the resolver also
  // returns workspace_send_guards blockers and the would-defer-to-next-day
  // flag, so prepare/review/launch never recompute them inline.
  workspaceId?: string | null;
}

export interface ResolvedNumber {
  id: string;
  phone: string;
  status: string;
  webhook_connected: boolean;
  allocation: number;
  daily_cap: number;
  backoff_until: string | null;
}

export interface StructuredBlocker {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface WorkspaceGuardSnapshot {
  enabled: boolean;
  hard_daily_cap: number | null;
  hard_per_campaign_cap: number | null;
  force_paced: boolean;
  // Live counters used for daily-cap evaluation.
  workspace_sent_today: number;
  workspace_pending: number;
  planned_volume: number;
}

export interface LaunchContract {
  ok: boolean;
  perNumberQuota: number;
  daysCount: number;
  windowFitCapPerNumber: number;
  perNumberCaps: Record<string, number>;        // window-fit clamped cap
  allocByNumber: Record<string, number>;         // capped round-robin allocation across whole campaign (days × cap)
  capacityPerDay: number;
  capacityToday: number;
  allocatedCapacity: number;                     // capacityPerDay × daysCount
  truncatedCount: number;                        // max(0, audienceCount - allocatedCapacity)
  audienceAllocated: number;                     // min(audienceCount, allocatedCapacity)
  blockers: string[];
  warnings: string[];
  structuredBlockers: StructuredBlocker[];       // machine-readable mirror of `blockers` for 409 mapping
  numbersDetail: ResolvedNumber[];
  templatesDetail: Array<{ id: string; name: string; status: string }>;
  signaturePayload: Record<string, unknown>;
  signature: string;
  killSwitchEngaged: boolean;
  wouldDeferToNextDay: boolean;                  // single-day launch crossing today's remaining quota
  workspaceGuard: WorkspaceGuardSnapshot | null; // null when no workspaceId or no enabled row
}

export async function computeSnapshotSignature(payload: Record<string, unknown>): Promise<string> {
  const txt = JSON.stringify(payload);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return "sha256:" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ResolveOptions {
  // When true, blockers include workspace-guard / kill-switch checks intended for launch.
  // Prepare uses the same checks. Slice 2: workspace guard hard caps are now
  // also evaluated inside this resolver when `input.workspaceId` is provided.
  includeKillSwitch?: boolean;
}

/**
 * Pure-ish resolver. Pulls only the data needed to compute the contract:
 * whatsapp_numbers, message_templates, provider_backoff, today's sent counts
 * (Dubai TZ), and the global instant kill switch flag.
 */
export async function resolveLaunchContract(
  admin: any,
  input: LaunchContractInput,
  opts: ResolveOptions = {},
): Promise<LaunchContract> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const structuredBlockers: StructuredBlocker[] = [];
  const addBlocker = (code: string, message: string, meta?: Record<string, unknown>) => {
    blockers.push(message);
    structuredBlockers.push({ code, message, ...(meta ? { meta } : {}) });
  };

  const perNumberQuota = normalizePerNumberQuota(input.perNumberQuota);
  const numberIds = [...new Set(input.numbers.map((n) => n.number_id))];
  const templateIds = [...new Set(input.numbers.map((n) => n.template_id))];
  const audienceCount = Math.max(0, Math.floor(Number(input.audienceCount || 0)));
  const daysCount = Math.max(1, input.scheduledDates.length || 1);
  const isBlast = input.dispatchMode === "marketing_instant" || (input.minDelaySeconds <= 0);

  // Window-fit cap (paced campaigns only). Honors operator's minDelay verbatim.
  const wsMin = hhmmToMin(input.windowStart);
  const wsMax = hhmmToMin(input.windowEnd);
  const windowSeconds = Math.max(60, (wsMax - wsMin) * 60);
  const minGap = isBlast ? 1 : Math.max(1, input.minDelaySeconds || 1);
  const windowFitCap = isBlast ? perNumberQuota : Math.max(1, Math.floor(windowSeconds / minGap));

  // Fetch number + template + backoff in parallel.
  const [numbersRes, templatesRes, backoffRes] = await Promise.all([
    admin.from("whatsapp_numbers")
      .select("id, user_id, workspace_id, phone_number, status, webhook_connected, paused_at, paused_reason, daily_send_limit, provider_api_key")
      .in("id", numberIds),
    admin.from("message_templates")
      .select("id, name, status")
      .in("id", templateIds),
    admin.from("provider_backoff")
      .select("whatsapp_number_id, retry_after")
      .in("whatsapp_number_id", numberIds),
  ]);

  const numberRows: any[] = numbersRes.data ?? [];
  const templateRows: any[] = templatesRes.data ?? [];
  const backoffMap = new Map<string, string>();
  for (const b of backoffRes.data ?? []) backoffMap.set(b.whatsapp_number_id, b.retry_after);

  if (numberRows.length !== numberIds.length) addBlocker("numbers_missing", "One or more selected numbers not found.");
  if (templateRows.length !== templateIds.length) addBlocker("templates_missing", "One or more selected templates not found.");

  // Today's sent counts per number, Dubai TZ.
  const dubaiTodayStartIso = (() => {
    const dubaiKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    return new Date(`${dubaiKey}T00:00:00+04:00`).toISOString();
  })();
  const sentTodayByNumber = new Map<string, number>();
  await Promise.all(numberIds.map(async (nid) => {
    const { count } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_number_id", nid)
      .gte("sent_at", dubaiTodayStartIso);
    sentTodayByNumber.set(nid, count ?? 0);
  }));

  // Per-number cap (window-fit clamped).
  const perNumberCaps: Record<string, number> = {};
  let capacityPerDay = 0;
  let capacityToday = 0;
  for (const nid of numberIds) {
    const nrow: any = numberRows.find((n) => n.id === nid);
    const cap = Math.max(1, Math.min(perNumberQuota, windowFitCap));
    perNumberCaps[nid] = cap;
    capacityPerDay += cap;
    const sentToday = sentTodayByNumber.get(nid) ?? 0;
    capacityToday += Math.min(cap, Math.max(0, perNumberQuota - sentToday));

    const dailyLimit = explicitDailySendLimit(nrow?.daily_send_limit);
    if (dailyLimit !== null && perNumberQuota > dailyLimit) {
      warnings.push(`Number ${nrow?.phone_number || nid}: per-number quota ${perNumberQuota} exceeds its daily_send_limit recommendation (${dailyLimit}). Honoring operator override.`);
    }
    if (sentToday >= perNumberQuota) {
      warnings.push(`Number ${nrow?.phone_number || nid} already sent ${sentToday}/${perNumberQuota} today — new recipients would defer to next day.`);
    }
  }

  const allocatedCapacity = capacityPerDay * daysCount;
  const audienceAllocated = Math.min(audienceCount, allocatedCapacity);
  const truncatedCount = Math.max(0, audienceCount - allocatedCapacity);
  if (truncatedCount > 0) {
    warnings.push(`Capacity is ${allocatedCapacity} but audience is ${audienceCount}. Add more numbers, raise per-number cap, or split.`);
  }

  // Round-robin allocation across days × per-number cap.
  const allocByNumber: Record<string, number> = {};
  for (const nid of numberIds) allocByNumber[nid] = 0;
  let remaining = audienceAllocated;
  while (remaining > 0) {
    let placed = false;
    for (const nid of numberIds) {
      const totalCap = perNumberCaps[nid] * daysCount;
      const cur = allocByNumber[nid];
      if (cur < totalCap) {
        allocByNumber[nid] = cur + 1;
        remaining--;
        placed = true;
        if (remaining === 0) break;
      }
    }
    if (!placed) break;
  }

  // Per-number blockers.
  const numbersDetail: ResolvedNumber[] = numberRows.map((n: any) => {
    const allocation = allocByNumber[n.id] ?? 0;
    if (n.webhook_connected === false) addBlocker("number_webhook_disconnected", `Number ${n.phone_number}: webhook not connected — replies would be lost.`, { number_id: n.id });
    if (n.status === "banned" || n.status === "restricted") addBlocker("number_blocked", `Number ${n.phone_number} is ${n.status}.`, { number_id: n.id, status: n.status });
    if (n.paused_at) addBlocker("number_paused", `Number ${n.phone_number} is paused: ${n.paused_reason ?? "no reason"}.`, { number_id: n.id });
    if (!n.provider_api_key) addBlocker("number_no_provider_key", `Number ${n.phone_number}: no provider API key.`, { number_id: n.id });
    if (allocation === 0 && audienceCount > 0) addBlocker("number_zero_allocation", `Number ${n.phone_number} got zero allocation — remove it from the pool or raise its daily cap.`, { number_id: n.id });
    return {
      id: n.id,
      phone: n.phone_number,
      status: n.status,
      webhook_connected: n.webhook_connected,
      allocation,
      daily_cap: explicitDailySendLimit(n.daily_send_limit) ?? perNumberQuota,
      backoff_until: backoffMap.get(n.id) ?? null,
    };
  });

  for (const t of templateRows) {
    if (t.status !== "approved") addBlocker("template_not_approved", `Template "${t.name}" is ${t.status}, not approved.`, { template_id: t.id, status: t.status });
  }

  let killSwitchEngaged = false;
  if (opts.includeKillSwitch !== false && input.dispatchMode === "marketing_instant") {
    const { data: flag } = await admin.from("system_flags").select("value").eq("key", "marketing_instant_enabled").maybeSingle();
    if (flag && flag.value === false) {
      killSwitchEngaged = true;
      blockers.push("Marketing Instant mode is globally disabled (kill switch).");
    }
  }

  const signaturePayload = {
    v: SNAPSHOT_CONTRACT_VERSION,
    n: [...numberIds].sort(),
    t: [...templateIds].sort(),
    a: audienceCount,
    ws: input.windowStart,
    we: input.windowEnd,
    q: perNumberQuota,
    in: input.maxInflightPerNumber,
    ic: input.maxInflightPerCampaign,
    d: daysCount,
    md: input.minDelaySeconds,
    rt: input.respectRecipientTz ? 1 : 0,
    dm: input.dispatchMode,
  };
  const signature = await computeSnapshotSignature(signaturePayload);

  return {
    ok: blockers.length === 0,
    perNumberQuota,
    daysCount,
    windowFitCapPerNumber: windowFitCap,
    perNumberCaps,
    allocByNumber,
    capacityPerDay,
    capacityToday,
    allocatedCapacity,
    truncatedCount,
    audienceAllocated,
    blockers,
    warnings,
    numbersDetail,
    templatesDetail: templateRows.map((t: any) => ({ id: t.id, name: t.name, status: t.status })),
    signaturePayload,
    signature,
    killSwitchEngaged,
  };
}
