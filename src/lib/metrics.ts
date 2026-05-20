// =============================================================
// METRICS — single source of truth used by every card.
//
// Reads from v_metrics_today / v_metrics_alltime DB views and
// the campaign_live_status() function. NEVER read campaign
// counters (sent_count / today_recipients_count) for cards —
// they lag and double-count cancelled siblings.
// =============================================================

import { supabase } from "@/integrations/supabase/client";

export type LiveStatus =
  | "sending_now"
  | "running"
  | "completed_today"
  | "completed_earlier"
  | "scheduled"
  | "paused"
  | "cancelled"
  | "failed"
  | "draft"
  | "unknown";

export type TodayMetrics = {
  sent_today: number;
  delivered_today: number;
  failed_today: number;
  replies_today: number;
};

export type AlltimeMetrics = {
  sent_alltime: number;
  delivered_alltime: number;
  failed_alltime: number;
};

export type EarningsMetrics = {
  earned_today: number;
  earned_7d: number;
  earned_alltime: number;
};

const ZERO_TODAY: TodayMetrics = { sent_today: 0, delivered_today: 0, failed_today: 0, replies_today: 0 };
const ZERO_ALL: AlltimeMetrics = { sent_alltime: 0, delivered_alltime: 0, failed_alltime: 0 };
const ZERO_EARN: EarningsMetrics = { earned_today: 0, earned_7d: 0, earned_alltime: 0 };

const sumToday = (rows: any[]): TodayMetrics =>
  rows.reduce<TodayMetrics>((acc, r) => ({
    sent_today: acc.sent_today + (r.sent_today ?? 0),
    delivered_today: acc.delivered_today + (r.delivered_today ?? 0),
    failed_today: acc.failed_today + (r.failed_today ?? 0),
    replies_today: acc.replies_today + (r.replies_today ?? 0),
  }), { ...ZERO_TODAY });

const sumAll = (rows: any[]): AlltimeMetrics =>
  rows.reduce<AlltimeMetrics>((acc, r) => ({
    sent_alltime: acc.sent_alltime + (r.sent_alltime ?? 0),
    delivered_alltime: acc.delivered_alltime + (r.delivered_alltime ?? 0),
    failed_alltime: acc.failed_alltime + (r.failed_alltime ?? 0),
  }), { ...ZERO_ALL });

// ---------- WORKSPACE ----------
export async function fetchWorkspaceMetrics(
  workspaceIds?: string[]
): Promise<Map<string, TodayMetrics & AlltimeMetrics>> {
  let q1 = supabase.from("v_metrics_today").select("workspace_id, sent_today, delivered_today, failed_today, replies_today");
  let q2 = supabase.from("v_metrics_alltime").select("workspace_id, sent_alltime, delivered_alltime, failed_alltime");
  if (workspaceIds && workspaceIds.length) {
    q1 = q1.in("workspace_id", workspaceIds);
    q2 = q2.in("workspace_id", workspaceIds);
  }
  const [{ data: today }, { data: all }] = await Promise.all([q1, q2]);
  const byWs = new Map<string, TodayMetrics & AlltimeMetrics>();
  const ensure = (id: string) => {
    if (!byWs.has(id)) byWs.set(id, { ...ZERO_TODAY, ...ZERO_ALL });
    return byWs.get(id)!;
  };
  (today ?? []).forEach((r: any) => {
    if (!r.workspace_id) return;
    const m = ensure(r.workspace_id);
    m.sent_today += r.sent_today ?? 0;
    m.delivered_today += r.delivered_today ?? 0;
    m.failed_today += r.failed_today ?? 0;
    m.replies_today += r.replies_today ?? 0;
  });
  (all ?? []).forEach((r: any) => {
    if (!r.workspace_id) return;
    const m = ensure(r.workspace_id);
    m.sent_alltime += r.sent_alltime ?? 0;
    m.delivered_alltime += r.delivered_alltime ?? 0;
    m.failed_alltime += r.failed_alltime ?? 0;
  });
  return byWs;
}

// ---------- NUMBERS ----------
export async function fetchNumberMetrics(
  numberIds: string[]
): Promise<Map<string, TodayMetrics & AlltimeMetrics>> {
  if (!numberIds.length) return new Map();
  const [{ data: today }, { data: all }] = await Promise.all([
    supabase.from("v_metrics_today_by_number").select("whatsapp_number_id, sent_today, delivered_today, failed_today").in("whatsapp_number_id", numberIds),
    supabase.from("v_metrics_alltime").select("whatsapp_number_id, sent_alltime, delivered_alltime, failed_alltime").in("whatsapp_number_id", numberIds),
  ]);
  const byNum = new Map<string, TodayMetrics & AlltimeMetrics>();
  const ensure = (id: string) => {
    if (!byNum.has(id)) byNum.set(id, { ...ZERO_TODAY, ...ZERO_ALL });
    return byNum.get(id)!;
  };
  (today ?? []).forEach((r: any) => {
    if (!r.whatsapp_number_id) return;
    const m = ensure(r.whatsapp_number_id);
    m.sent_today += r.sent_today ?? 0;
    m.delivered_today += r.delivered_today ?? 0;
    m.failed_today += r.failed_today ?? 0;
  });
  (all ?? []).forEach((r: any) => {
    if (!r.whatsapp_number_id) return;
    const m = ensure(r.whatsapp_number_id);
    m.sent_alltime += r.sent_alltime ?? 0;
    m.delivered_alltime += r.delivered_alltime ?? 0;
    m.failed_alltime += r.failed_alltime ?? 0;
  });
  return byNum;
}

// ---------- PARTNERS ----------
// Canonical: `number_ownership` (populated in Phase A) is the single source
// of truth for "which numbers belong to a partner". Stats are pulled via the
// same per-number RPC the per-BM rows use, so totals reconcile to the digit.
export async function fetchPartnerMetrics(
  partnerIds: string[]
): Promise<Map<string, TodayMetrics & AlltimeMetrics & EarningsMetrics>> {
  const out = new Map<string, TodayMetrics & AlltimeMetrics & EarningsMetrics>();
  partnerIds.forEach((p) => out.set(p, { ...ZERO_TODAY, ...ZERO_ALL, ...ZERO_EARN }));
  if (!partnerIds.length) return out;

  // partner -> currently-owned numbers + active rate
  const { data: ownership } = await supabase
    .from("number_ownership")
    .select("partner_id, whatsapp_number_id, rate_usd, effective_to")
    .in("partner_id", partnerIds)
    .is("effective_to", null);

  const numToPartner = new Map<string, string>();
  const numToRate = new Map<string, number>();
  (ownership ?? []).forEach((r: any) => {
    if (!numToPartner.has(r.whatsapp_number_id)) {
      numToPartner.set(r.whatsapp_number_id, r.partner_id);
      numToRate.set(r.whatsapp_number_id, Number(r.rate_usd ?? 0));
    }
  });
  const numIds = Array.from(numToPartner.keys());
  if (!numIds.length) return out;

  const { data: live } = await (supabase.rpc as any)("number_live_stats", { p_number_ids: numIds });
  (live ?? []).forEach((r: any) => {
    const pid = numToPartner.get(r.whatsapp_number_id);
    if (!pid) return;
    const acc = out.get(pid)!;
    const rate = numToRate.get(r.whatsapp_number_id) ?? 0;
    const delivToday = Number(r.delivered_today ?? 0);
    const deliv7d = Number(r.delivered_7d ?? 0);
    const delivAll = Number(r.delivered_all ?? 0);
    acc.sent_today += Number(r.sent_today ?? 0);
    acc.delivered_today += delivToday;
    acc.failed_today += Number(r.failed_today ?? 0);
    acc.sent_alltime += Number(r.sent_all ?? 0);
    acc.delivered_alltime += delivAll;
    acc.failed_alltime += Number(r.failed_today ?? 0); // failed_all not in RPC; best-effort
    acc.earned_today += delivToday * rate;
    acc.earned_7d += deliv7d * rate;
    acc.earned_alltime += delivAll * rate;
  });
  return out;
}

// Returns map: whatsapp_number_id -> current active rate (USD per delivered).
// Used to compute live earnings for per-BM rows where we already have number_live_stats.
export async function fetchNumberRates(
  partnerId?: string
): Promise<Map<string, number>> {
  let q = supabase
    .from("number_ownership")
    .select("whatsapp_number_id, rate_usd, partner_id")
    .is("effective_to", null);
  if (partnerId) q = q.eq("partner_id", partnerId);
  const { data } = await q;
  const m = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    if (!m.has(r.whatsapp_number_id)) m.set(r.whatsapp_number_id, Number(r.rate_usd ?? 0));
  });
  return m;
}

// ---------- BUSINESS MANAGERS (aggregate over linked numbers) ----------
export async function fetchBmMetrics(
  bmIds: string[]
): Promise<Map<string, TodayMetrics & AlltimeMetrics & { number_ids: string[] }>> {
  if (!bmIds.length) return new Map();
  const { data: nums } = await supabase
    .from("whatsapp_numbers")
    .select("id, business_manager_id")
    .in("business_manager_id", bmIds);
  const byBm = new Map<string, { ids: string[] }>();
  (nums ?? []).forEach((n: any) => {
    if (!byBm.has(n.business_manager_id)) byBm.set(n.business_manager_id, { ids: [] });
    byBm.get(n.business_manager_id)!.ids.push(n.id);
  });
  const allNumIds = (nums ?? []).map((n: any) => n.id);
  const numMetrics = await fetchNumberMetrics(allNumIds);
  const out = new Map<string, TodayMetrics & AlltimeMetrics & { number_ids: string[] }>();
  bmIds.forEach((id) => out.set(id, { ...ZERO_TODAY, ...ZERO_ALL, number_ids: [] }));
  for (const [bmId, { ids }] of byBm) {
    const acc = out.get(bmId)!;
    acc.number_ids = ids;
    for (const numId of ids) {
      const m = numMetrics.get(numId);
      if (!m) continue;
      acc.sent_today += m.sent_today;
      acc.delivered_today += m.delivered_today;
      acc.failed_today += m.failed_today;
      acc.sent_alltime += m.sent_alltime;
      acc.delivered_alltime += m.delivered_alltime;
      acc.failed_alltime += m.failed_alltime;
    }
  }
  return out;
}

// ---------- CAMPAIGNS ----------
export async function fetchCampaignLiveStatus(campaignIds: string[]): Promise<Map<string, LiveStatus>> {
  if (!campaignIds.length) return new Map();
  // Single-row RPCs aren't worth it; do one round-trip per id via a small batched function call.
  const out = new Map<string, LiveStatus>();
  const results = await Promise.all(
    campaignIds.map(async (id) => {
      const { data } = await supabase.rpc("campaign_live_status", { _campaign_id: id });
      return [id, (data ?? "unknown") as LiveStatus] as const;
    })
  );
  results.forEach(([id, st]) => out.set(id, st));
  return out;
}

/** Aggregate a list of per-campaign live statuses into a single label
 *  for a sibling group (display: highest-priority status wins). */
export function aggregateLiveStatus(statuses: LiveStatus[]): LiveStatus {
  const order: LiveStatus[] = [
    "sending_now", "running", "scheduled", "paused",
    "completed_today", "completed_earlier", "draft", "cancelled", "failed", "unknown",
  ];
  for (const s of order) if (statuses.includes(s)) return s;
  return "unknown";
}

export const liveStatusLabel = (s: LiveStatus): string => ({
  sending_now: "Sending now",
  running: "Running",
  scheduled: "Scheduled",
  paused: "Paused",
  completed_today: "Completed today",
  completed_earlier: "Already ran",
  draft: "Draft",
  cancelled: "Cancelled",
  failed: "Failed",
  unknown: "—",
})[s];
