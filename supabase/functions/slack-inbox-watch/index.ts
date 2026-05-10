// Detects unread spikes per workspace and enqueues an inbox_unread_spike Slack event.
// Cron: every 30 minutes. Honors quiet hours 22:00-09:00 UAE. Cooldown 2h per workspace.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNREAD_THRESHOLD = 5;
const COOLDOWN_HOURS = 2;

function isTerminalReply(text: string | null | undefined): boolean {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?\s]+$/g, "");
  return normalized === "block" || normalized === "not for me";
}

function isQuietHourUAE(now = new Date()): boolean {
  const uaeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hour12: false }).format(now));
  return uaeHour >= 22 || uaeHour < 9;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (isQuietHourUAE()) {
    return new Response(JSON.stringify({ skipped: "quiet_hours" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: workspaces, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, slug, internal_code, slack_channel_id, inbox_alerts_enabled, last_inbox_spike_alert_at")
    .eq("is_active", true)
    .eq("inbox_alerts_enabled", true)
    .not("slack_channel_id", "is", null);

  if (wsErr) {
    return new Response(JSON.stringify({ error: wsErr.message }), { status: 500, headers: corsHeaders });
  }

  const cooldownMs = COOLDOWN_HOURS * 3_600_000;
  const now = Date.now();
  let queued = 0;

  for (const ws of workspaces || []) {
    if (ws.last_inbox_spike_alert_at && (now - new Date(ws.last_inbox_spike_alert_at).getTime()) < cooldownMs) continue;

    const { data: convsRaw, error: cErr } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, unread_count, last_message_text")
      .eq("workspace_id", ws.id)
      .gt("unread_count", 0)
      .order("unread_count", { ascending: false })
      .limit(40);
    if (cErr) { console.error("conv fetch", cErr.message); continue; }

    // Drop conversations that are already terminal-no replies. Some imports
    // still sit in an open CRM stage until an operator moves them, so stage
    // filtering alone is not enough for Slack inbox alerts.
    let convs = (convsRaw || []).filter((c) => !isTerminalReply(c.last_message_text));
    if (convs.length > 0) {
      const ids = convs.map((c) => c.id);
      const { data: deals } = await supabase
        .from("deals")
        .select("conversation_id, stage:pipeline_stages!stage_id(stage_type)")
        .in("conversation_id", ids);
      const lostSet = new Set(
        (deals || [])
          .filter((d: any) => d?.stage?.stage_type === "lost")
          .map((d: any) => d.conversation_id),
      );
      convs = convs.filter((c) => !lostSet.has(c.id)).slice(0, 20);
    }

    const total = convs.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    if (total < UNREAD_THRESHOLD) continue;

    await supabase.from("slack_event_queue").insert({
      event_type: "inbox_unread_spike",
      workspace_id: ws.id,
      payload: { unread_total: total, conversations: convs },
    });
    await supabase.from("workspaces").update({ last_inbox_spike_alert_at: new Date().toISOString() }).eq("id", ws.id);
    queued++;
  }

  return new Response(JSON.stringify({ queued, scanned: workspaces?.length || 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
