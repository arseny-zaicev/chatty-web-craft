// Generic lead-intake webhook.
// External systems POST lead rows here. Authentication is per-source via
// secret_token (header `x-source-token` or query `?token=...`). Each call
// creates an import_batch and a lead_imports row per accepted lead, dedupes
// by phone within the workspace+pipeline, opens or attaches a conversation,
// and (if the pipeline has auto_outreach_enabled) enqueues a single-recipient
// campaign for first touch.
//
// Request body:
//   { leads: [ { phone, name?, external_id?, payload? }, ... ] }
// or a single object with the same shape.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-source-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhone(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[^\d+]/g, "");
  if (!s) return null;
  const digits = s.startsWith("+") ? s.slice(1) : s;
  if (digits.length < 7 || digits.length > 16) return null;
  return digits;
}

type LeadInput = {
  phone?: unknown;
  name?: unknown;
  external_id?: unknown;
  payload?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const token =
      req.headers.get("x-source-token") ||
      url.searchParams.get("token") ||
      "";
    if (!token) return json({ error: "Missing source token" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: source } = await admin
      .from("source_connections")
      .select("id, workspace_id, pipeline_id, kind, status, name")
      .eq("secret_token", token)
      .maybeSingle();
    if (!source) return json({ error: "Invalid source token" }, 403);
    if (source.status !== "active") return json({ error: `Source is ${source.status}` }, 423);

    // Resolve pipeline + workspace defaults for first-touch
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id, workspace_id, auto_outreach_enabled, first_touch_template_id, default_sender_number_ids, slack_channel_id")
      .eq("id", source.pipeline_id)
      .maybeSingle();
    if (!pipeline) return json({ error: "Pipeline missing" }, 410);

    const body = await req.json().catch(() => ({}));
    const rawLeads: LeadInput[] = Array.isArray(body?.leads)
      ? body.leads
      : Array.isArray(body)
        ? body
        : body?.phone
          ? [body]
          : [];
    if (rawLeads.length === 0) return json({ error: "No leads in payload" }, 400);
    if (rawLeads.length > 500) return json({ error: "Max 500 leads per call" }, 413);

    // 1. Open the batch
    const { data: batch, error: batchErr } = await admin
      .from("import_batches")
      .insert({
        workspace_id: source.workspace_id,
        pipeline_id: source.pipeline_id,
        source_connection_id: source.id,
        source_kind: source.kind,
        status: "processing",
        total: rawLeads.length,
      })
      .select("id")
      .single();
    if (batchErr || !batch) return json({ error: batchErr?.message ?? "Could not open batch" }, 500);

    let accepted = 0;
    let rejected = 0;
    const acceptedLeads: { id: string; phone: string; name: string | null; conversation_id: string | null }[] = [];

    // 2. Validate + dedupe + import each row
    for (const raw of rawLeads) {
      const phone = normalizePhone(raw?.phone);
      const name = raw?.name ? String(raw.name).slice(0, 200) : null;
      const externalId = raw?.external_id ? String(raw.external_id).slice(0, 200) : null;
      const payload = (raw?.payload && typeof raw.payload === "object") ? raw.payload : {};

      if (!phone) {
        rejected++;
        await admin.from("lead_imports").insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone: String(raw?.phone ?? ""),
          name,
          payload,
          status: "invalid",
          error: "Invalid phone",
        });
        continue;
      }

      // Dedupe within workspace
      const { data: existingConv } = await admin
        .from("conversations")
        .select("id, pipeline_id")
        .eq("workspace_id", source.workspace_id)
        .eq("contact_phone", phone)
        .maybeSingle();

      if (existingConv) {
        rejected++;
        await admin.from("lead_imports").insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone,
          name,
          payload,
          conversation_id: existingConv.id,
          status: "duplicate",
        });
        continue;
      }

      const { data: imported, error: impErr } = await admin
        .from("lead_imports")
        .insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone,
          name,
          payload,
          status: pipeline.auto_outreach_enabled ? "pending" : "awaiting_manual",
        })
        .select("id")
        .single();
      if (impErr || !imported) {
        rejected++;
        continue;
      }
      accepted++;
      acceptedLeads.push({ id: imported.id, phone, name, conversation_id: null });
    }

    // 3. Close the batch
    await admin
      .from("import_batches")
      .update({
        status: rejected === rawLeads.length ? "failed" : "completed",
        accepted,
        rejected,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    await admin
      .from("source_connections")
      .update({ last_ingest_at: new Date().toISOString(), last_error: null })
      .eq("id", source.id);

    // 4. Enqueue Slack notification
    await admin.from("slack_event_queue").insert({
      event_type: rejected === rawLeads.length ? "lead.import_failed" : "lead.imported",
      workspace_id: source.workspace_id,
      payload: {
        source_id: source.id,
        source_name: source.name,
        source_kind: source.kind,
        pipeline_id: source.pipeline_id,
        batch_id: batch.id,
        total: rawLeads.length,
        accepted,
        rejected,
        slack_channel_id: pipeline.slack_channel_id,
      },
    });

    // 5. Accepted leads are inserted with status `pending` (auto-outreach on)
    // or `awaiting_manual` (auto-outreach off). The lead-dispatch cron picks
    // up `pending` rows every minute and routes them through the campaigns
    // engine. No further action needed here.

    return json({
      ok: true,
      batch_id: batch.id,
      total: rawLeads.length,
      accepted,
      rejected,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
