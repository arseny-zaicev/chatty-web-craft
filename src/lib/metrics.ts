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

// ---------- PARTNERS (CANONICAL) ----------
// Source of truth: `partner_metrics_for_range` RPC, which aggregates the
// event-based per-day basis (v_payout_basis -> metrics_for_range) and
// attributes each day to whichever partner / rate was active on that day
// via number_ownership(effective_from, effective_to). Earnings therefore
// honour reassignments and historical rate changes.
//
// This reconciles partner totals to BM totals (also event-based via
// v_metrics_today_by_number / v_metrics_alltime) and to workspace totals.
type PartnerRangeRow = { partner_id: string; sent: number; delivered: number; failed: number; earned_usd: number };

async function partnerMetricsForRange(
  partnerIds: string[],
  from: string,
  to: string,
): Promise<Map<string, PartnerRangeRow>> {
  const out = new Map<string, PartnerRangeRow>();
  if (!partnerIds.length) return out;
  const { data } = await (supabase.rpc as any)("partner_metrics_for_range", {
    p_partner_ids: partnerIds, _from: from, _to: to,
  });
  (data ?? []).forEach((r: any) => {
    if (!r.partner_id) return;
    out.set(r.partner_id, {
      partner_id: r.partner_id,
      sent: Number(r.sent ?? 0),
      delivered: Number(r.delivered ?? 0),
      failed: Number(r.failed ?? 0),
      earned_usd: Number(r.earned_usd ?? 0),
    });
  });
  return out;
}

export async function fetchPartnerMetrics(
  partnerIds: string[]
): Promise<Map<string, TodayMetrics & AlltimeMetrics & EarningsMetrics & { sent_7d: number; delivered_7d: number }>> {
  type Row = TodayMetrics & AlltimeMetrics & EarningsMetrics & { sent_7d: number; delivered_7d: number };
  const out = new Map<string, Row>();
  partnerIds.forEach((p) =>
    out.set(p, { ...ZERO_TODAY, ...ZERO_ALL, ...ZERO_EARN, sent_7d: 0, delivered_7d: 0 })
  );
  if (!partnerIds.length) return out;

  const dubaiToday = dubaiStartOfDayIso();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const farFuture = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const epoch = "1970-01-01T00:00:00Z";

  const [today, last7d, alltime] = await Promise.all([
    partnerMetricsForRange(partnerIds, dubaiToday, farFuture),
    partnerMetricsForRange(partnerIds, sevenDaysAgo, farFuture),
    partnerMetricsForRange(partnerIds, epoch, farFuture),
  ]);

  for (const pid of partnerIds) {
    const acc = out.get(pid)!;
    const t = today.get(pid);
    const w = last7d.get(pid);
    const a = alltime.get(pid);
    if (t) {
      acc.sent_today = t.sent;
      acc.delivered_today = t.delivered;
      acc.failed_today = t.failed;
      acc.earned_today = t.earned_usd;
    }
    if (w) {
      acc.sent_7d = w.sent;
      acc.delivered_7d = w.delivered;
      acc.earned_7d = w.earned_usd;
    }
    if (a) {
      acc.sent_alltime = a.sent;
      acc.delivered_alltime = a.delivered;
      acc.failed_alltime = a.failed;
      acc.earned_alltime = a.earned_usd;
    }
  }
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

// ---------- CAMPAIGN CANONICAL TRUTH ----------
// Event-based sent/delivered/failed/replied per campaign, derived from
// whatsapp_message_events via metrics_for_range (dedup by provider_message_id).
// This is the SINGLE source of truth for campaign-facing daily and alltime
// numbers across:
//   - WorkspaceCampaigns group cards & detail totals
//   - CampaignReportPanel KPI strip
//   - LatestReportCard delivered/sent
//   - Portfolio per-campaign active rollup (today) & recent_launches (alltime)
// Never read campaigns.sent_count / failed_count / today_recipients_count for UI.

export type CampaignTruth = { sent: number; delivered: number; failed: number; replied: number };
const ZERO_CT: CampaignTruth = { sent: 0, delivered: 0, failed: 0, replied: 0 };

function dubaiStartOfDayIso(): string {
  const dubaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  return new Date(`${dubaiDate}T00:00:00+04:00`).toISOString();
}

export async function fetchCampaignTruth(
  campaignIds: string[],
  range: "today" | "alltime",
): Promise<Map<string, CampaignTruth>> {
  const out = new Map<string, CampaignTruth>();
  if (!campaignIds.length) return out;
  const from = range === "today" ? dubaiStartOfDayIso() : "1970-01-01T00:00:00Z";
  // +1 day forward window so just-arrived events are not clipped.
  const to = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { data } = await (supabase.rpc as any)("campaign_metrics_for_range", {
    p_campaign_ids: campaignIds,
    _from: from,
    _to: to,
  });
  (data ?? []).forEach((r: any) => {
    if (!r.campaign_id) return;
    out.set(r.campaign_id, {
      sent: Number(r.sent ?? 0),
      delivered: Number(r.delivered ?? 0),
      failed: Number(r.failed ?? 0),
      replied: Number(r.replied ?? 0),
    });
  });
  // Ensure every requested id has a zero entry.
  campaignIds.forEach((id) => { if (!out.has(id)) out.set(id, { ...ZERO_CT }); });
  return out;
}

export function sumCampaignTruth(
  ids: string[],
  m: Map<string, CampaignTruth>,
): CampaignTruth {
  return ids.reduce<CampaignTruth>((acc, id) => {
    const v = m.get(id);
    if (!v) return acc;
    return {
      sent: acc.sent + v.sent,
      delivered: acc.delivered + v.delivered,
      failed: acc.failed + v.failed,
      replied: acc.replied + v.replied,
    };
  }, { ...ZERO_CT });
}
