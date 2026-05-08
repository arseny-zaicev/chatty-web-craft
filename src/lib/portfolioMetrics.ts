import { supabase } from "@/integrations/supabase/client";

const startOfDayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export type WorkspaceMetrics = {
  workspace_id: string;
  unread_replies: number;
  active_campaigns: number;
  numbers_total: number;
  numbers_ready: number;
  delivered_today: number;
  replies_today: number;
  last_activity: string | null;
  next_launch: string | null;
  health: "healthy" | "attention" | "blocked";
};

export type PortfolioSnapshot = {
  totals: {
    clients: number;
    active_campaigns: number;
    unread_replies: number;
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

export async function fetchPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const today = startOfDayIso();

  const [
    { data: workspaces },
    { data: convs },
    { data: numbers },
    { data: campaigns },
    { data: msgsToday },
    { data: nextLaunches },
  ] = await Promise.all([
    supabase.from("workspaces").select("id").eq("is_active", true),
    supabase.from("conversations").select("id, workspace_id, unread_count, last_message_at"),
    supabase.from("whatsapp_numbers").select("workspace_id, is_active, connected_in_gupshup, connected_in_iskra"),
    supabase.from("campaigns").select("workspace_id, status, scheduled_start_at").in("status", ["scheduled", "running", "paused", "draft"]),
    supabase.from("messages").select("conversation_id, direction, created_at, status").gte("created_at", today),
    supabase.from("campaigns").select("workspace_id, scheduled_start_at").in("status", ["scheduled", "draft"]).gte("scheduled_start_at", new Date().toISOString()).order("scheduled_start_at", { ascending: true }),
  ]);
  const bookedToday: { id: string }[] = [];

  const byWorkspace: Record<string, WorkspaceMetrics> = {};
  const ensure = (id: string): WorkspaceMetrics => {
    if (!byWorkspace[id]) {
      byWorkspace[id] = {
        workspace_id: id,
        unread_replies: 0,
        active_campaigns: 0,
        numbers_total: 0,
        numbers_ready: 0,
        delivered_today: 0,
        replies_today: 0,
        last_activity: null,
        next_launch: null,
        health: "healthy",
      };
    }
    return byWorkspace[id];
  };

  (workspaces ?? []).forEach((w) => ensure(w.id));

  // Map conversation_id -> workspace_id for messages
  const convWs = new Map<string, string>();
  (convs ?? []).forEach((c) => {
    const m = ensure(c.workspace_id);
    m.unread_replies += c.unread_count ?? 0;
    if (c.last_message_at && (!m.last_activity || c.last_message_at > m.last_activity)) {
      m.last_activity = c.last_message_at;
    }
    convWs.set(c.id as unknown as string, c.workspace_id);
  });

  (numbers ?? []).forEach((n) => {
    const m = ensure(n.workspace_id);
    m.numbers_total += 1;
    if (n.is_active && n.connected_in_gupshup && n.connected_in_iskra) m.numbers_ready += 1;
  });

  (campaigns ?? []).forEach((c) => {
    const m = ensure(c.workspace_id);
    if (c.status === "scheduled" || c.status === "running") m.active_campaigns += 1;
  });

  (nextLaunches ?? []).forEach((c) => {
    const m = ensure(c.workspace_id);
    if (!m.next_launch && c.scheduled_start_at) m.next_launch = c.scheduled_start_at;
  });

  (msgsToday ?? []).forEach((msg) => {
    const wsId = convWs.get(msg.conversation_id as unknown as string);
    if (!wsId) return;
    const m = ensure(wsId);
    if (msg.direction === "outbound") {
      if (msg.status === "delivered" || msg.status === "read" || msg.status === "sent") m.delivered_today += 1;
    } else if (msg.direction === "inbound") {
      m.replies_today += 1;
    }
  });

  // Health rule
  Object.values(byWorkspace).forEach((m) => {
    if (m.numbers_total === 0 || m.numbers_ready === 0) m.health = "blocked";
    else if (m.unread_replies > 20 || m.numbers_ready < m.numbers_total) m.health = "attention";
    else m.health = "healthy";
  });

  const totals = {
    clients: (workspaces ?? []).length,
    active_campaigns: Object.values(byWorkspace).reduce((s, m) => s + m.active_campaigns, 0),
    unread_replies: Object.values(byWorkspace).reduce((s, m) => s + m.unread_replies, 0),
    delivered_today: Object.values(byWorkspace).reduce((s, m) => s + m.delivered_today, 0),
    replies_today: Object.values(byWorkspace).reduce((s, m) => s + m.replies_today, 0),
    booked_calls_today: (bookedToday ?? []).length,
    issues: Object.values(byWorkspace).filter((m) => m.health !== "healthy").length,
  };

  return { totals, byWorkspace };
}

export type WorkspaceOverview = WorkspaceMetrics & {
  templates_approved: number;
  recent_launches: Array<{ id: string; name: string; status: string; created_at: string; sent_count: number; total: number }>;
};

export async function fetchWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverview> {
  const today = startOfDayIso();
  const [{ data: convs }, { data: numbers }, { data: campaigns }, { data: templates }, { data: recent }] = await Promise.all([
    supabase.from("conversations").select("id, unread_count, last_message_at").eq("workspace_id", workspaceId),
    supabase.from("whatsapp_numbers").select("is_active, connected_in_gupshup, connected_in_iskra").eq("workspace_id", workspaceId),
    supabase.from("campaigns").select("status, scheduled_start_at").eq("workspace_id", workspaceId),
    supabase.from("message_templates").select("status").eq("workspace_id", workspaceId).eq("status", "approved"),
    supabase.from("campaigns").select("id, name, status, created_at, sent_count, total_recipients").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(5),
  ]);

  const convIds = (convs ?? []).map((c) => c.id);
  let delivered_today = 0;
  let replies_today = 0;
  if (convIds.length) {
    const { data: msgsToday } = await supabase
      .from("messages")
      .select("direction, status, created_at")
      .gte("created_at", today)
      .in("conversation_id", convIds);
    (msgsToday ?? []).forEach((m) => {
      if (m.direction === "outbound" && (m.status === "delivered" || m.status === "read" || m.status === "sent")) delivered_today += 1;
      if (m.direction === "inbound") replies_today += 1;
    });
  }

  const numbers_total = (numbers ?? []).length;
  const numbers_ready = (numbers ?? []).filter((n) => n.is_active && n.connected_in_gupshup && n.connected_in_iskra).length;
  const unread_replies = (convs ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);
  const active_campaigns = (campaigns ?? []).filter((c) => c.status === "scheduled" || c.status === "running").length;
  const next_launch = (campaigns ?? [])
    .filter((c) => (c.status === "scheduled" || c.status === "draft") && c.scheduled_start_at && c.scheduled_start_at > new Date().toISOString())
    .sort((a, b) => (a.scheduled_start_at! > b.scheduled_start_at! ? 1 : -1))[0]?.scheduled_start_at ?? null;
  const last_activity = (convs ?? []).reduce<string | null>((acc, c) => (c.last_message_at && (!acc || c.last_message_at > acc) ? c.last_message_at : acc), null);

  let health: WorkspaceMetrics["health"] = "healthy";
  if (numbers_total === 0 || numbers_ready === 0) health = "blocked";
  else if (unread_replies > 20 || numbers_ready < numbers_total) health = "attention";

  return {
    workspace_id: workspaceId,
    unread_replies,
    active_campaigns,
    numbers_total,
    numbers_ready,
    delivered_today,
    replies_today,
    last_activity,
    next_launch,
    health,
    templates_approved: (templates ?? []).length,
    recent_launches: (recent ?? []).map((r) => ({ id: r.id, name: r.name, status: r.status, created_at: r.created_at, sent_count: r.sent_count ?? 0, total: r.total_recipients ?? 0 })),
  };
}
