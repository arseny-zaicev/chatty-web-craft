import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const ALLOWED_HOSTS = new Set([
  "hooks.zapier.com",
  "hook.eu1.make.com",
  "hook.us1.make.com",
  "hook.eu2.make.com",
]);

const Body = z.object({
  pipeline_id: z.string().uuid(),
  url: z.string().url(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { pipeline_id, url } = parsed.data;

  let host = "";
  try { host = new URL(url).hostname; } catch {}
  if (!ALLOWED_HOSTS.has(host)) {
    return new Response(JSON.stringify({
      error: `URL host "${host || "unknown"}" not allowed. Use hooks.zapier.com or hook.<region>.make.com.`,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Verify caller is a manager of this pipeline's workspace
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: pipe } = await admin
    .from("pipelines").select("workspace_id").eq("id", pipeline_id).maybeSingle();
  if (!pipe) {
    return new Response(JSON.stringify({ error: "Pipeline not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isManager } = await admin.rpc("is_workspace_manager", {
    _workspace_id: pipe.workspace_id, _user_id: claims.claims.sub,
  });
  if (!isManager) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = {
    event: "webhook.test",
    occurred_at: new Date().toISOString(),
    pipeline_id,
    workspace_id: pipe.workspace_id,
    message: "Test ping from your Lovable workspace. If you see this in Zapier - the integration works.",
  };

  let status = 0, body = "", err: string | null = null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(t);
    status = r.status;
    body = (await r.text()).slice(0, 500);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return new Response(JSON.stringify({
    ok: status >= 200 && status < 300,
    response_status: status, response_body: body, error: err,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
