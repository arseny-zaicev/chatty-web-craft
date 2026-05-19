import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cronGuard } from "../_shared/cronGuard.ts";

const ALLOWED_HOSTS = new Set([
  "hooks.zapier.com",
  "hook.eu1.make.com",
  "hook.us1.make.com",
  "hook.eu2.make.com",
]);
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

Deno.serve(cronGuard("dispatch-pipeline-webhooks", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await admin
    .from("pipeline_webhook_deliveries")
    .select("id, pipeline_id, payload, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pipelineIds = [...new Set((rows ?? []).map((r) => r.pipeline_id))];
  const { data: pipelines } = await admin
    .from("pipelines")
    .select("id, zapier_webhook_url")
    .in("id", pipelineIds.length ? pipelineIds : ["00000000-0000-0000-0000-000000000000"]);
  const urlByPipeline = new Map<string, string | null>();
  (pipelines ?? []).forEach((p) => urlByPipeline.set(p.id, p.zapier_webhook_url));

  let sent = 0, failed = 0, skipped = 0;

  for (const row of rows ?? []) {
    const url = urlByPipeline.get(row.pipeline_id);
    if (!url) {
      await admin.from("pipeline_webhook_deliveries").update({
        status: "failed", error: "Pipeline has no webhook URL", sent_at: new Date().toISOString(),
      }).eq("id", row.id);
      skipped++;
      continue;
    }
    if (!isAllowed(url)) {
      await admin.from("pipeline_webhook_deliveries").update({
        status: "failed", error: "URL host not allowed (only Zapier/Make hooks)", sent_at: new Date().toISOString(),
      }).eq("id", row.id);
      failed++;
      continue;
    }

    let respStatus = 0;
    let respBody = "";
    let errMsg: string | null = null;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row.payload),
        signal: ac.signal,
      });
      clearTimeout(t);
      respStatus = r.status;
      respBody = (await r.text()).slice(0, 500);
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    const ok = respStatus >= 200 && respStatus < 300;
    const isTerminal4xx = respStatus >= 400 && respStatus < 500;
    const nextAttempts = (row.attempts ?? 0) + 1;
    const finalize = ok || isTerminal4xx || nextAttempts >= MAX_ATTEMPTS;

    await admin.from("pipeline_webhook_deliveries").update({
      status: finalize ? (ok ? "sent" : "failed") : "pending",
      attempts: nextAttempts,
      response_status: respStatus || null,
      response_body: respBody || null,
      error: errMsg,
      sent_at: finalize ? new Date().toISOString() : null,
    }).eq("id", row.id);

    if (ok) sent++; else if (finalize) failed++;
  }

  return new Response(JSON.stringify({ processed: rows?.length ?? 0, sent, failed, skipped }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));
