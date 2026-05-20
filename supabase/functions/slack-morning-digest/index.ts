// Morning digest at 09:00 UAE: planned campaigns + volumes for today.
// Posts a global summary to ops-campaigns and per-workspace summary to client channels.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildDigestBlocks, postSlack, brandTag } from "../_shared/slackBlocks.ts";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const OPS_CAMPAIGNS = Deno.env.get("SLACK_OPS_CAMPAIGNS_CHANNEL_ID") || "";

function todayUaeDateStr(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date()); // YYYY-MM-DD
}

Deno.serve(cronGuard("slack-morning-digest", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = todayUaeDateStr();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, total_recipients, scheduled_start_at, scheduled_dates, status, workspace_id, workspaces(id, name, slug, internal_code, slack_channel_id)")
    .in("status", ["scheduled", "running"])
    .or(`scheduled_dates.cs.{${today}},scheduled_start_at.gte.${today}T00:00:00Z`);

  // Canonical truth: alltime sent per campaign, so "remaining" is honest.
  const ids = (campaigns ?? []).map((c) => c.id);
  const sentByCampaign = new Map<string, number>();
  if (ids.length > 0) {
    const { data: truth } = await supabase.rpc("campaign_metrics_for_range", {
      p_campaign_ids: ids,
      _from: "1970-01-01T00:00:00Z",
      _to: new Date().toISOString(),
    });
    for (const t of (truth ?? []) as Array<{ campaign_id: string; sent: number }>) {
      sentByCampaign.set(t.campaign_id, t.sent ?? 0);
    }
  }

  const rowsByWs = new Map<string, any[]>();
  let totalCampaigns = 0; let totalVolume = 0;
  const allRows: any[] = [];

  for (const c of campaigns || []) {
    const ws = (c as any).workspaces;
    if (!ws) continue;
    const sent = sentByCampaign.get(c.id) ?? 0;
    const remaining = Math.max(0, (c.total_recipients || 0) - sent);
    const row = {
      workspace_name: brandTag(ws.name, ws.internal_code),
      campaign_name: c.name,
      total: remaining,
      scheduled_at: c.scheduled_start_at,
      status: c.status,
      _ws: ws,
    };
    totalCampaigns++; totalVolume += remaining;
    allRows.push(row);
    if (!rowsByWs.has(ws.id)) rowsByWs.set(ws.id, []);
    rowsByWs.get(ws.id)!.push(row);
  }

  // Global digest → ops-campaigns
  if (OPS_CAMPAIGNS) {
    const msg = buildDigestBlocks({
      kind: "morning", ws: null, scope: "ops",
      rows: allRows, totals: { campaigns: totalCampaigns, volume: totalVolume },
    });
    try { await postSlack(OPS_CAMPAIGNS, msg); } catch (e) { console.error("ops digest failed", e); }
  }

  // Per-workspace digest
  for (const [wsId, rows] of rowsByWs) {
    const ws = rows[0]._ws;
    if (!ws?.slack_channel_id) continue;
    const wsTotals = rows.reduce((a, r) => ({ campaigns: a.campaigns + 1, volume: a.volume + (r.total || 0) }), { campaigns: 0, volume: 0 });
    const msg = buildDigestBlocks({
      kind: "morning",
      ws: { id: ws.id, name: ws.name, slug: ws.slug, internal_code: ws.internal_code },
      scope: "workspace", rows, totals: wsTotals,
    });
    try { await postSlack(ws.slack_channel_id, msg); } catch (e) { console.error("ws digest failed", wsId, e); }
  }

  return new Response(JSON.stringify({ workspaces: rowsByWs.size, campaigns: totalCampaigns, volume: totalVolume }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));
