// Cron-driven auto-generation of campaign insights.
// Two triggers:
//  1) Recently completed campaigns with no insight row yet (initial generation).
//  2) Existing insights that are stale: ≥10 new replies or ≥10 new
//     classifications since the snapshot's `generated_at`, throttled to
//     once per 30 min per campaign.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_PER_TICK = 5;
const REGEN_THROTTLE_MIN = 30;
const REGEN_THRESHOLD = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- 1) Initial generation: completed in last 7 days, no insight yet ----
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: existing } = await admin
    .from("campaign_insights")
    .select("campaign_id, generated_at");
  const insightByCampaign = new Map<string, string>();
  for (const r of existing ?? []) insightByCampaign.set((r as any).campaign_id, (r as any).generated_at);

  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, name, workspace_id, updated_at, total_recipients, status")
    .gte("updated_at", since)
    .gt("total_recipients", 0)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const todo: Array<{ id: string; reason: string }> = [];
  const throttleCutoff = new Date(Date.now() - REGEN_THROTTLE_MIN * 60 * 1000);

  for (const c of campaigns ?? []) {
    const cid = (c as any).id as string;
    const status = (c as any).status as string;
    const lastGenIso = insightByCampaign.get(cid);

    if (!lastGenIso) {
      // Initial generation only after the campaign is finished.
      if (status === "completed") todo.push({ id: cid, reason: "initial" });
      continue;
    }

    // Stale-insight regeneration. Throttle: only consider campaigns whose
    // last snapshot is older than 30 min.
    const lastGen = new Date(lastGenIso);
    if (lastGen > throttleCutoff) continue;

    // Count new replies (inbound messages) and new classifications since lastGen.
    const lastGenIsoStr = lastGen.toISOString();
    const [{ count: newReplies }, { count: newClassified }] = await Promise.all([
      admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", lastGenIsoStr)
        .in("conversation_id", []), // placeholder, replaced below
      admin
        .from("conversation_insights")
        .select("conversation_id", { count: "exact", head: true })
        .eq("workspace_id", (c as any).workspace_id)
        .gte("tagged_at", lastGenIsoStr),
    ]);

    // The messages count above with empty `in` is always 0 — replaced with a
    // narrower per-campaign query so we don't over-fetch.
    const { data: convRows } = await admin
      .from("campaign_recipients")
      .select("conversation_id")
      .eq("campaign_id", cid)
      .not("conversation_id", "is", null)
      .limit(2000);
    const convIds = Array.from(new Set((convRows ?? []).map((r: any) => r.conversation_id).filter(Boolean)));

    let realNewReplies = 0;
    if (convIds.length > 0) {
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", lastGenIsoStr)
        .in("conversation_id", convIds);
      realNewReplies = count ?? 0;
    }

    void newReplies; // silence unused
    if (realNewReplies >= REGEN_THRESHOLD || (newClassified ?? 0) >= REGEN_THRESHOLD) {
      todo.push({ id: cid, reason: `stale: +${realNewReplies}r/+${newClassified ?? 0}c` });
    }
  }

  const queue = todo.slice(0, MAX_PER_TICK);
  const results: Array<{ id: string; reason: string; ok: boolean; error?: string }> = [];

  for (const c of queue) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/campaign-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({ campaign_id: c.id }),
      });
      if (!r.ok) {
        const t = await r.text();
        results.push({ id: c.id, reason: c.reason, ok: false, error: t.slice(0, 200) });
      } else {
        results.push({ id: c.id, reason: c.reason, ok: true });
      }
    } catch (e) {
      results.push({ id: c.id, reason: c.reason, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(JSON.stringify({
    scanned: campaigns?.length ?? 0,
    eligible: todo.length,
    processed: results.length,
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
