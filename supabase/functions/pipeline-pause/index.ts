// pipeline-pause: atomically pause/resume a pipeline.
// - flips pipelines.auto_outreach_enabled
// - sets all related kind='first_touch' campaigns to 'paused' (when pausing)
//   or back to 'running' (when resuming, only those previously 'paused')
// Auth: caller must be a workspace manager (or admin).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "invalid auth" }, 401);
    const uid = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const pipeline_id: string | undefined = body.pipeline_id;
    const paused: boolean = Boolean(body.paused);
    if (!pipeline_id) return json({ error: "pipeline_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: pipe, error: pipeErr } = await admin
      .from("pipelines")
      .select("id, workspace_id, name, auto_outreach_enabled")
      .eq("id", pipeline_id)
      .maybeSingle();
    if (pipeErr || !pipe) return json({ error: "pipeline not found" }, 404);

    const { data: isManager } = await admin.rpc("is_workspace_manager", {
      _workspace_id: pipe.workspace_id,
      _user_id: uid,
    });
    if (!isManager) return json({ error: "forbidden" }, 403);

    // Toggle pipeline auto-outreach
    const { error: upErr } = await admin
      .from("pipelines")
      .update({ auto_outreach_enabled: !paused })
      .eq("id", pipeline_id);
    if (upErr) return json({ error: upErr.message }, 500);

    // Toggle in-flight first-touch campaigns
    let affected = 0;
    if (paused) {
      const { data, error } = await admin
        .from("campaigns")
        .update({ status: "paused" })
        .eq("pipeline_id", pipeline_id)
        .eq("kind", "first_touch")
        .eq("status", "running")
        .select("id");
      if (error) return json({ error: error.message }, 500);
      affected = data?.length || 0;
    } else {
      const { data, error } = await admin
        .from("campaigns")
        .update({ status: "running" })
        .eq("pipeline_id", pipeline_id)
        .eq("kind", "first_touch")
        .eq("status", "paused")
        .select("id");
      if (error) return json({ error: error.message }, 500);
      affected = data?.length || 0;
    }

    // Best-effort Slack note
    await admin.from("slack_event_queue").insert({
      event_type: paused ? "pipeline.paused" : "pipeline.resumed",
      workspace_id: pipe.workspace_id,
      payload: {
        pipeline_id,
        pipeline_name: pipe.name,
        actor_user_id: uid,
        affected_campaigns: affected,
      },
    });

    return json({ ok: true, pipeline_id, paused, affected_campaigns: affected });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
