// Cron-driven auto-generation of campaign insights.
// Finds recently completed campaigns that have no insight row yet, and invokes
// campaign-insights for each (capped per tick to keep costs bounded).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_PER_TICK = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Completed in the last 7 days, no insight yet, has at least one recipient.
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: existing } = await admin.from("campaign_insights").select("campaign_id");
  const skip = new Set((existing || []).map((r: any) => r.campaign_id as string));

  const { data: campaigns, error } = await admin
    .from("campaigns")
    .select("id, name, workspace_id, updated_at, total_recipients")
    .eq("status", "completed")
    .gte("updated_at", since)
    .gt("total_recipients", 0)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const todo = (campaigns || []).filter((c: any) => !skip.has(c.id)).slice(0, MAX_PER_TICK);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const c of todo) {
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
        results.push({ id: c.id, ok: false, error: t.slice(0, 200) });
      } else {
        results.push({ id: c.id, ok: true });
      }
    } catch (e) {
      results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(JSON.stringify({ scanned: campaigns?.length ?? 0, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
