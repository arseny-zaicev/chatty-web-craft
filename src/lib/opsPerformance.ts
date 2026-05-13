import { supabase } from "@/integrations/supabase/client";

export type OperatorRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  assigned_now: number;
  active_now: number;
  unread_now: number;
  waiting_now: number;
  overdue_now: number;
  oldest_waiting_at: string | null;
  median_first_response_seconds: number | null;
  median_response_seconds: number | null;
  positive_replies_window: number;
  meetings_now: number;
  human_replies_window: number;
};

export type AssignedConversationRow = {
  conversation_id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_slug: string | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  unread_count: number;
  last_inbound_at: string | null;
  last_human_reply_at: string | null;
  waiting_since: string | null;
  assigned_at: string | null;
};

export type WindowKey = "today" | "7d" | "30d";

export function windowRange(key: WindowKey): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (key === "today") {
    // Dubai start of day
    const dubai = new Date(end.toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
    dubai.setHours(0, 0, 0, 0);
    // convert back: subtract Dubai offset
    start.setTime(dubai.getTime() - 4 * 60 * 60 * 1000);
  } else if (key === "7d") {
    start.setDate(start.getDate() - 7);
  } else {
    start.setDate(start.getDate() - 30);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function fetchOperatorPerformance(win: WindowKey): Promise<OperatorRow[]> {
  const { start, end } = windowRange(win);
  const { data, error } = await supabase.rpc("ops_operator_performance", {
    _window_start: start,
    _window_end: end,
  });
  if (error) throw error;
  return (data ?? []) as OperatorRow[];
}

export async function fetchOperatorConversations(userId: string): Promise<AssignedConversationRow[]> {
  const { data, error } = await supabase.rpc("ops_operator_assigned_conversations", { _user_id: userId });
  if (error) throw error;
  return (data ?? []) as AssignedConversationRow[];
}

export function formatDurationSeconds(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return "-";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

export function statusFor(row: AssignedConversationRow): { label: string; tone: "ok" | "warn" | "crit" | "idle" } {
  if (row.waiting_since) {
    const ageMs = Date.now() - new Date(row.waiting_since).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) return { label: "Stuck >24h", tone: "crit" };
    if (ageMs > 2 * 60 * 60 * 1000) return { label: "Overdue", tone: "warn" };
    return { label: "Waiting", tone: "warn" };
  }
  return { label: "Replied", tone: "ok" };
}
