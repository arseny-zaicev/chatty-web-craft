import { supabase } from "@/integrations/supabase/client";
import { baseName as splitBase } from "./campaigns";
import { fetchCampaignTruth, sumCampaignTruth } from "./metrics";

const startOfDayIso = () => {
  const dubaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
  return new Date(`${dubaiDate}T00:00:00+04:00`).toISOString();
};

export type WorkspaceHealth = "running" | "scheduled" | "idle" | "attention" | "blocked";

export type WorkspaceMetrics = {
  workspace_id: string;
  unread_replies: number;
  active_campaigns: number;
  numbers_total: number;
  numbers_ready: number;
  numbers_active: number;
  sent_today: number;
  delivered_today: number;
  replies_today: number;
  last_activity: string | null;
  next_launch: string | null;
  campaign_end: string | null;
  running_campaign_name: string | null;
  scheduled_campaign_name: string | null;
  active_campaign_name: string | null;
  active_campaign_status: "running" | "scheduled" | null;
  active_campaign_sent: number;
  active_campaign_delivered: number;
  active_campaign_total: number;
  active_campaign_kind: "marketing" | "utility" | "manual" | string | null;
  is_sending_now: boolean;
  health: WorkspaceHealth;
};

export type PortfolioSnapshot = {
  totals: {
    clients: number;
    active_campaigns: number;
    unread_replies: number;
    sent_today: number;
    delivered_today: number;
    replies_today: number;
    booked_calls_today: number;
    issues: number;
  };
  byWorkspace: Record<string, WorkspaceMetrics>;
};

export const portfolioKeys = {
  snapshot: ["portfolio", "snapshot"] as const,
  workspaceOverview: (id: string) => ["portfolio", "workspace", id] as const,
};

const RECENT_ACTIVITY_WINDOW_MIN = 10;

export async function fetchPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const recentSinceIso = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MIN * 60_000).toISOString();

  const [
    { data: workspaces },
    { data: convs },
    { data: numbers },
    { data: campaigns },
    { data: metricsToday },
    { data: metricsByCampaign },
    { data: recentSent },
  ] = await Promise.all([
    supabase.from("workspaces").select("id").eq("is_active", true),
    supabase.from("conversations").select("id, workspace_id, unread_count, last_message_at"),
    supabase.from("whatsapp_numbers").select("workspace_id, is_active, connected_in_gupshup, connected_in_iskra"),
    supabase
      .from("campaigns")
      .select("id, workspace_id, name, status, kind, scheduled_start_at, scheduled_dates, recurrence_end_at, sent_count, total_recipients")
      .in("status", ["scheduled", "running", "paused"]),
    // v_metrics_today: one row per workspace - safe to sum.
    supabase.from("v_metrics_today").select("workspace_id, sent_today, delivered_today, replies_today"),
    // v_metrics_today_by_campaign: per-campaign sent for active-group rollup.
    supabase.from("v_metrics_today_by_campaign").select("workspace_id, campaign_id, sent_today, delivered_today"),
    // Recent recipient activity per workspace -> drives is_sending_now.
    supabase
      .from("campaign_recipients")
      .select("workspace_id, campaign_id, sent_at")
      .gte("sent_at", recentSinceIso),
  ]);

  const byWorkspace: Record<string, WorkspaceMetrics> = {};
  const ensure = (id: string): WorkspaceMetrics => {
    if (!byWorkspace[id]) {
      byWorkspace[id] = {
        workspace_id: id,
        unread_replies: 0,
        active_campaigns: 0,
        numbers_total: 0,
        numbers_ready: 0,
        numbers_active: 0,
        sent_today: 0,
        delivered_today: 0,
        replies_today: 0,
        last_activity: null,
        next_launch: null,
        campaign_end: null,
        running_campaign_name: null,
        scheduled_campaign_name: null,
        active_campaign_name: null,
        active_campaign_status: null,
        active_campaign_sent: 0,
        active_campaign_delivered: 0,
        active_campaign_total: 0,
        active_campaign_kind: null,
        is_sending_now: false,
        health: "idle",
      };
    }
    return byWorkspace[id];
  };

  (workspaces ?? []).forEach((w) => ensure(w.id));

  (convs ?? []).forEach((c) => {
    const m = ensure(c.workspace_id);
    m.unread_replies += c.unread_count ?? 0;
    if (c.last_message_at && (!m.last_activity || c.last_message_at > m.last_activity)) {
      m.last_activity = c.last_message_at;
    }
  });

  (numbers ?? []).forEach((n) => {
    const m = ensure(n.workspace_id);
    m.numbers_total += 1;
    if (n.is_active) m.numbers_active += 1;
    if (n.is_active && n.connected_in_gupshup && n.connected_in_iskra) m.numbers_ready += 1;
  });

  // Workspace-level totals: one row per workspace, safe to sum directly.
  (metricsToday ?? []).forEach((r: any) => {
    if (!r.workspace_id) return;
    const m = ensure(r.workspace_id);
    m.sent_today += r.sent_today ?? 0;
    m.delivered_today += r.delivered_today ?? 0;
    m.replies_today += r.replies_today ?? 0;
  });

  // Per-campaign sent for active-group rollup.
  const sentByWsCampaign = new Map<string, number>(); // key = ws|campaign
  const deliveredByWsCampaign = new Map<string, number>();
  (metricsByCampaign ?? []).forEach((r: any) => {
    if (!r.workspace_id || !r.campaign_id) return;
    const k = `${r.workspace_id}|${r.campaign_id}`;
    sentByWsCampaign.set(k, (sentByWsCampaign.get(k) ?? 0) + (r.sent_today ?? 0));
    deliveredByWsCampaign.set(k, (deliveredByWsCampaign.get(k) ?? 0) + (r.delivered_today ?? 0));
  });

  // Recent activity per (workspace, campaign) for sending-now detection.
  const recentByWsCampaign = new Set<string>();
  const recentByWs = new Set<string>();
  (recentSent ?? []).forEach((r: any) => {
    if (!r.workspace_id || !r.sent_at) return;
    if (r.campaign_id) recentByWsCampaign.add(`${r.workspace_id}|${r.campaign_id}`);
    recentByWs.add(r.workspace_id);
  });

  const nowIso = new Date().toISOString();
  const baseOf = (name: string) => splitBase(name ?? "");

  // Pick the active group base per workspace (running > soonest scheduled).
  // Cancelled / failed siblings are already excluded by the .in() filter above.
  const activeBase: Record<
    string,
    { base: string; status: "running" | "scheduled"; kind: string | null; startsAt?: string }
  > = {};
  (campaigns ?? []).forEach((c: any) => {
    const wsId = c.workspace_id as string;
    const dates = (c.scheduled_dates as string[] | null) ?? [];
    const endDate = c.recurrence_end_at || (dates.length ? dates[dates.length - 1] : null);
    const m = ensure(wsId);
    if (c.status === "scheduled" || c.status === "running") m.active_campaigns += 1;

    if (c.status === "running") {
      if (!m.running_campaign_name) m.running_campaign_name = c.name ?? null;
      if (endDate && (!m.campaign_end || endDate > m.campaign_end)) m.campaign_end = endDate;
      const cur = activeBase[wsId];
      if (!cur || cur.status !== "running") {
        activeBase[wsId] = { base: baseOf(c.name), status: "running", kind: c.kind ?? null };
      }
    } else if (c.status === "scheduled" && c.scheduled_start_at && c.scheduled_start_at > nowIso) {
      if (!m.next_launch || c.scheduled_start_at < m.next_launch) {
        m.next_launch = c.scheduled_start_at;
        m.scheduled_campaign_name = c.name ?? null;
      }
      if (endDate && (!m.campaign_end || endDate > m.campaign_end)) m.campaign_end = endDate;
      const cur = activeBase[wsId];
      if (
        !cur ||
        (cur.status === "scheduled" && (!cur.startsAt || c.scheduled_start_at < cur.startsAt))
      ) {
        activeBase[wsId] = {
          base: baseOf(c.name),
          status: "scheduled",
          kind: c.kind ?? null,
          startsAt: c.scheduled_start_at,
        };
      }
    }
  });

  // Aggregate sent/total across siblings IN the active group only.
  // sent = today's sent from v_metrics_today (truth); total = total_recipients from row.
  (campaigns ?? []).forEach((c: any) => {
    const wsId = c.workspace_id as string;
    const grp = activeBase[wsId];
    if (!grp) return;
    if (baseOf(c.name) !== grp.base) return;
    const m = ensure(wsId);
    m.active_campaign_name = grp.base;
    m.active_campaign_status = grp.status;
    m.active_campaign_kind = grp.kind;
    const todaySent = sentByWsCampaign.get(`${wsId}|${c.id}`) ?? 0;
    const todayDelivered = deliveredByWsCampaign.get(`${wsId}|${c.id}`) ?? 0;
    m.active_campaign_sent += todaySent;
    m.active_campaign_delivered += todayDelivered;
    m.active_campaign_total += c.total_recipients ?? 0;
  });

  // "Sending now": status=running AND activity in last 10 min in any sibling of the active group.
  Object.values(byWorkspace).forEach((m) => {
    m.is_sending_now =
      m.active_campaign_status === "running" &&
      (campaigns ?? []).some((c: any) => {
        if (c.workspace_id !== m.workspace_id) return false;
        const grp = activeBase[m.workspace_id];
        if (!grp || baseOf(c.name) !== grp.base) return false;
        return recentByWsCampaign.has(`${m.workspace_id}|${c.id}`);
      });
  });

  // Health
  Object.values(byWorkspace).forEach((m) => {
    if (m.numbers_active === 0) m.health = "blocked";
    else if (m.is_sending_now) m.health = "running";
    else if (m.running_campaign_name) m.health = "running";
    else if (m.next_launch) m.health = "scheduled";
    else if (m.unread_replies >= 20) m.health = "attention";
    else m.health = "idle";
  });

  const totals = {
    clients: (workspaces ?? []).length,
    active_campaigns: Object.values(byWorkspace).reduce((s, m) => s + m.active_campaigns, 0),
    unread_replies: Object.values(byWorkspace).reduce((s, m) => s + m.unread_replies, 0),
    sent_today: Object.values(byWorkspace).reduce((s, m) => s + m.sent_today, 0),
    delivered_today: Object.values(byWorkspace).reduce((s, m) => s + m.delivered_today, 0),
    replies_today: Object.values(byWorkspace).reduce((s, m) => s + m.replies_today, 0),
    booked_calls_today: 0,
    issues: Object.values(byWorkspace).filter((m) => m.health === "blocked" || m.health === "attention").length,
  };

  return { totals, byWorkspace };
}

export type WorkspaceOverview = WorkspaceMetrics & {
  templates_approved: number;
  recent_launches: Array<{ id: string; name: string; status: string; created_at: string; sent_count: number; total: number }>;
};

export async function fetchWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverview> {
  const [
    { data: convs },
    { data: numbers },
    { data: campaigns },
    { data: templates },
    { data: recent },
    { data: metricsToday },
  ] = await Promise.all([
    supabase.from("conversations").select("id, unread_count, last_message_at").eq("workspace_id", workspaceId),
    supabase.from("whatsapp_numbers").select("is_active, connected_in_gupshup, connected_in_iskra").eq("workspace_id", workspaceId),
    supabase.from("campaigns").select("name, status, scheduled_start_at").eq("workspace_id", workspaceId),
    supabase.from("message_templates").select("status").eq("workspace_id", workspaceId).eq("status", "approved"),
    supabase
      .from("campaigns")
      .select("id, name, status, created_at, sent_count, total_recipients")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("v_metrics_today")
      .select("sent_today, delivered_today, replies_today")
      .eq("workspace_id", workspaceId),
  ]);

  let sent_today = 0, delivered_today = 0, replies_today = 0;
  (metricsToday ?? []).forEach((r: any) => {
    sent_today += r.sent_today ?? 0;
    delivered_today += r.delivered_today ?? 0;
    replies_today += r.replies_today ?? 0;
  });

  const numbers_total = (numbers ?? []).length;
  const numbers_active = (numbers ?? []).filter((n) => n.is_active).length;
  const numbers_ready = (numbers ?? []).filter((n) => n.is_active && n.connected_in_gupshup && n.connected_in_iskra).length;
  const unread_replies = (convs ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);

  const activeBases = new Set<string>();
  (campaigns ?? []).forEach((c: any) => {
    if (c.status === "scheduled" || c.status === "running") activeBases.add(splitBase(c.name ?? ""));
  });
  const active_campaigns = activeBases.size;

  const next_launch = (campaigns ?? [])
    .filter((c) => (c.status === "scheduled" || c.status === "draft") && c.scheduled_start_at && c.scheduled_start_at > new Date().toISOString())
    .sort((a, b) => (a.scheduled_start_at! > b.scheduled_start_at! ? 1 : -1))[0]?.scheduled_start_at ?? null;
  const last_activity = (convs ?? []).reduce<string | null>((acc, c) => (c.last_message_at && (!acc || c.last_message_at > acc) ? c.last_message_at : acc), null);

  let health: WorkspaceHealth = "idle";
  if (numbers_active === 0) health = "blocked";
  else if ((campaigns ?? []).some((c) => c.status === "running")) health = "running";
  else if (next_launch) health = "scheduled";
  else if (unread_replies >= 20) health = "attention";

  // Group recent launches by base name (exclude cancelled/failed siblings if a live one exists).
  type Launch = { id: string; name: string; status: string; created_at: string; sent_count: number; total: number };
  const byBase = new Map<string, any[]>();
  for (const r of (recent ?? [])) {
    const base = splitBase(r.name ?? "");
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(r);
  }
  const launchMap = new Map<string, Launch>();
  for (const [base, siblings] of byBase) {
    const live = siblings.filter((r: any) => !["cancelled", "failed"].includes(r.status));
    const effective = live.length ? live : siblings;
    const sum = effective.reduce(
      (acc, r: any) => ({
        sent: acc.sent + (r.sent_count ?? 0),
        total: acc.total + (r.total_recipients ?? 0),
        created: acc.created < r.created_at ? acc.created : r.created_at,
        status: (statusRank[r.status] ?? 0) > (statusRank[acc.status] ?? 0) ? r.status : acc.status,
      }),
      { sent: 0, total: 0, created: effective[0].created_at, status: effective[0].status }
    );
    launchMap.set(base, {
      id: effective[0].id,
      name: base,
      status: sum.status,
      created_at: sum.created,
      sent_count: sum.sent,
      total: sum.total,
    });
  }
  const recent_launches = Array.from(launchMap.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);

  return {
    workspace_id: workspaceId,
    unread_replies,
    active_campaigns,
    numbers_total,
    numbers_ready,
    numbers_active,
    sent_today,
    delivered_today,
    replies_today,
    last_activity,
    next_launch,
    campaign_end: null,
    running_campaign_name: null,
    scheduled_campaign_name: null,
    active_campaign_name: null,
    active_campaign_status: null,
    active_campaign_sent: 0,
    active_campaign_delivered: 0,
    active_campaign_total: 0,
    active_campaign_kind: null,
    is_sending_now: false,
    health,
    templates_approved: (templates ?? []).length,
    recent_launches,
  };
}

const statusRank: Record<string, number> = {
  running: 6, scheduled: 5, paused: 4, failed: 3, completed: 2, draft: 1, cancelled: 0,
};
