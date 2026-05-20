// Evening digest at 20:00 UAE: today's sent/failed by campaign + workspace.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildDigestBlocks, postSlack, brandTag } from "../_shared/slackBlocks.ts";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const OPS_CAMPAIGNS = Deno.env.get("SLACK_OPS_CAMPAIGNS_CHANNEL_ID") || "";

function todayUaeRangeUtc(): { startUtc: string; endUtc: string } {
  // 00:00 - 24:00 UAE = -4h UTC = 20:00 prev day - 20:00 today UTC
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now);
  const startUtc = new Date(`${today}T00:00:00+04:00`).toISOString();
  const endUtc = new Date(new Date(startUtc).getTime() + 24*60*60*1000).toISOString();
  return { startUtc, endUtc };
}

Deno.serve(cronGuard("slack-evening-digest", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { startUtc, endUtc } = todayUaeRangeUtc();

  // Find campaigns that had any activity today (via recipients sent_at) — keeps
  // the selector cheap, then read canonical truth for the actual day numbers.
  const { data: recips } = await supabase
    .from("campaign_recipients")
    .select("campaign_id")
    .gte("sent_at", startUtc)
    .lt("sent_at", endUtc)
    .in("status", ["sent", "failed", "delivered", "read"])
    .limit(50000);

  const ids = Array.from(new Set((recips ?? []).map((r) => r.campaign_id).filter(Boolean) as string[]));

  if (ids.length === 0) {
    if (OPS_CAMPAIGNS) {
      const msg = buildDigestBlocks({ kind: "evening", ws: null, scope: "ops", rows: [], totals: { campaigns: 0, volume: 0, sent: 0, failed: 0 } });
      try { await postSlack(OPS_CAMPAIGNS, msg); } catch (e) { console.error(e); }
    }
    return new Response(JSON.stringify({ ok: true, empty: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Canonical truth for today's window
  const { data: truth } = await supabase.rpc("campaign_metrics_for_range", {
    p_campaign_ids: ids,
    _from: startUtc,
    _to: endUtc,
  });
  const byCampaign = new Map<string, { sent: number; failed: number }>();
  for (const t of (truth ?? []) as Array<{ campaign_id: string; sent: number; failed: number }>) {
    byCampaign.set(t.campaign_id, { sent: t.sent ?? 0, failed: t.failed ?? 0 });
  }

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, total_recipients, workspaces(id, name, slug, internal_code, slack_channel_id)")
    .in("id", ids);

  const rowsByWs = new Map<string, any[]>();
  const allRows: any[] = [];
  let totalSent = 0; let totalFailed = 0;

  for (const c of campaigns || []) {
    const ws = (c as any).workspaces;
    if (!ws) continue;
    const day = byCampaign.get(c.id)!;
    totalSent += day.sent; totalFailed += day.failed;
    const row = {
      workspace_name: brandTag(ws.name, ws.internal_code),
      campaign_name: c.name,
      total: c.total_recipients || 0,
      sent: day.sent,
      failed: day.failed,
      _ws: ws,
    };
    allRows.push(row);
    if (!rowsByWs.has(ws.id)) rowsByWs.set(ws.id, []);
    rowsByWs.get(ws.id)!.push(row);
  }

  if (OPS_CAMPAIGNS) {
    const msg = buildDigestBlocks({
      kind: "evening", ws: null, scope: "ops", rows: allRows,
      totals: { campaigns: allRows.length, volume: totalSent, sent: totalSent, failed: totalFailed },
    });
    try { await postSlack(OPS_CAMPAIGNS, msg); } catch (e) { console.error("ops evening failed", e); }
  }

  for (const [wsId, rows] of rowsByWs) {
    const ws = rows[0]._ws;
    if (!ws?.slack_channel_id) continue;
    const t = rows.reduce((a, r) => ({ sent: a.sent + r.sent, failed: a.failed + r.failed }), { sent: 0, failed: 0 });
    const msg = buildDigestBlocks({
      kind: "evening",
      ws: { id: ws.id, name: ws.name, slug: ws.slug, internal_code: ws.internal_code },
      scope: "workspace", rows,
      totals: { campaigns: rows.length, volume: t.sent, sent: t.sent, failed: t.failed },
    });
    try { await postSlack(ws.slack_channel_id, msg); } catch (e) { console.error("ws evening failed", wsId, e); }
  }

  return new Response(JSON.stringify({ workspaces: rowsByWs.size, sent: totalSent, failed: totalFailed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));
