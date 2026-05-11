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
  const cooldownSinceIso = new Date(Date.now() - cooldownMs).toISOString();
  let queued = 0;

  // Pre-fetch pipelines per workspace to know per-pipeline channel routing.
  const wsIds = (workspaces || []).map((w: any) => w.id);
  const { data: pipelinesAll } = wsIds.length
    ? await supabase
        .from("pipelines")
        .select("id, name, workspace_id, slack_channel_id")
        .in("workspace_id", wsIds)
    : { data: [] as any[] } as any;
  const pipelinesByWs: Record<string, any[]> = {};
  for (const p of pipelinesAll || []) {
    (pipelinesByWs[p.workspace_id] ||= []).push(p);
  }

  // Recent sent spike events (per workspace+pipeline) for cooldown.
  const { data: recentSpikes } = await supabase
    .from("slack_event_queue")
    .select("workspace_id, payload, processed_at, status")
    .eq("event_type", "inbox_unread_spike")
    .in("status", ["sent", "pending"])
    .gte("processed_at", cooldownSinceIso);
  const cooldownKeys = new Set<string>();
  for (const e of recentSpikes || []) {
    const pid = (e.payload as any)?.pipeline_id || "_ws";
    cooldownKeys.add(`${e.workspace_id}::${pid}`);
  }

  for (const ws of workspaces || []) {
    const { data: convsRaw, error: cErr } = await supabase
      .from("conversations")
      .select("id, contact_name, contact_phone, unread_count, last_message_text, pipeline_id")
      .eq("workspace_id", ws.id)
      .gt("unread_count", 0)
      .order("unread_count", { ascending: false })
      .limit(80);
    if (cErr) { console.error("conv fetch", cErr.message); continue; }

    // Drop terminal-no replies
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
      convs = convs.filter((c) => !lostSet.has(c.id));
    }

    // Group by pipeline. Pipelines with their own slack_channel_id get a
    // dedicated digest routed to that channel. Conversations whose pipeline
    // has no channel (or no pipeline at all) are aggregated into a single
    // workspace-level digest routed to ws.slack_channel_id.
    const pipelines = pipelinesByWs[ws.id] || [];
    const channelByPipeline: Record<string, string | null> = {};
    const nameByPipeline: Record<string, string> = {};
    for (const p of pipelines) {
      channelByPipeline[p.id] = p.slack_channel_id || null;
      nameByPipeline[p.id] = p.name;
    }

    const groups: Record<string, { channel: string | null; pipelineId: string | null; pipelineName: string | null; convs: typeof convs }> = {};
    for (const c of convs) {
      const pid = c.pipeline_id as string | null;
      const pipelineChannel = pid ? channelByPipeline[pid] : null;
      const key = pipelineChannel || "_ws";
      if (!groups[key]) {
        groups[key] = {
          channel: pipelineChannel,
          pipelineId: pipelineChannel ? pid : null,
          pipelineName: pipelineChannel && pid ? (nameByPipeline[pid] || null) : null,
          convs: [],
        };
      }
      groups[key].convs.push(c);
    }

    for (const g of Object.values(groups)) {
      const total = g.convs.reduce((acc, c) => acc + (c.unread_count || 0), 0);
      if (total < UNREAD_THRESHOLD) continue;
      const cooldownKey = `${ws.id}::${g.pipelineId || "_ws"}`;
      if (cooldownKeys.has(cooldownKey)) continue;

      const top = g.convs.slice(0, 20).map((c) => ({
        id: c.id, contact_name: c.contact_name, contact_phone: c.contact_phone,
        unread_count: c.unread_count, last_message_text: c.last_message_text,
      }));

      await supabase.from("slack_event_queue").insert({
        event_type: "inbox_unread_spike",
        workspace_id: ws.id,
        payload: {
          unread_total: total,
          conversations: top,
          pipeline_id: g.pipelineId,
          pipeline_name: g.pipelineName,
          slack_channel_id: g.channel,
        },
      });
      cooldownKeys.add(cooldownKey);
      queued++;
    }
  }

  return new Response(JSON.stringify({ queued, scanned: workspaces?.length || 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
