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
import { normalizePhone } from "../_shared/phone.ts";
import { normalizeFirstName } from "../_shared/name.ts";

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
      .select("id, workspace_id, pipeline_id, kind, status, name, config")
      .eq("secret_token", token)
      .maybeSingle();
    if (!source) return json({ error: "Invalid source token" }, 403);
    if (source.status !== "active") return json({ error: `Source is ${source.status}` }, 423);
    const defaultCC = (source as any).config?.default_country_code
      ? String((source as any).config.default_country_code) : null;

    // Resolve pipeline + workspace defaults for first-touch
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id, workspace_id, auto_outreach_enabled, first_touch_template_id, default_sender_number_ids, slack_channel_id, expected_country_codes")
      .eq("id", source.pipeline_id)
      .maybeSingle();
    if (!pipeline) return json({ error: "Pipeline missing" }, 410);

    // Combined CC list passed to phone normalizer: source default first, then pipeline-level.
    const pipelineCcs: string[] = Array.isArray((pipeline as any).expected_country_codes)
      ? ((pipeline as any).expected_country_codes as string[]) : [];
    const ccListForPhone: string[] = [
      ...(defaultCC ? [defaultCC] : []),
      ...pipelineCcs.filter((c) => c && c !== defaultCC),
    ];

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
    let invalidCount = 0;
    let ambiguousCount = 0;
    let testLeadCount = 0;
    let duplicateCount = 0;
    let crossPipelineDuplicateCount = 0;
    let nameUnusableCount = 0;
    const acceptedLeads: { id: string; phone: string; name: string | null; conversation_id: string | null }[] = [];

    // 2. Validate + dedupe + import each row
    for (const raw of rawLeads) {
      const phoneResult = normalizePhone(raw?.phone, defaultCC);
      const nameResult = normalizeFirstName(raw?.name);
      const name = nameResult.value;
      if (nameResult.outcome === "unusable") nameUnusableCount++;
      const externalId = raw?.external_id ? String(raw.external_id).slice(0, 200) : null;
      const incomingPayload = (raw?.payload && typeof raw.payload === "object") ? raw.payload : {};
      const payload: Record<string, unknown> = {
        ...incomingPayload,
        _phone_raw: phoneResult.raw,
        _first_name_raw: nameResult.raw ?? null,
        _first_name_outcome: nameResult.outcome,
      };

      if (!phoneResult.ok) {
        rejected++;
        if (phoneResult.status === "test_lead") testLeadCount++;
        else if (phoneResult.status === "ambiguous") ambiguousCount++;
        else invalidCount++;
        await admin.from("lead_imports").insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone: String(raw?.phone ?? "").slice(0, 32),
          name,
          payload,
          status: phoneResult.status === "test_lead" ? "invalid" : phoneResult.status === "ambiguous" ? "invalid" : "invalid",
          error: phoneResult.reason,
        });
        continue;
      }
      const phone = phoneResult.phone;

      // Owning-pipeline dedupe: a conversation sticks to whichever pipeline
      // created it first. If the same phone shows up later from a source
      // wired to a different pipeline, we record it as a duplicate referencing
      // the existing conversation and do NOT enqueue a first-touch.
      const { data: existingConv } = await admin
        .from("conversations")
        .select("id, pipeline_id")
        .eq("workspace_id", source.workspace_id)
        .eq("contact_phone", phone)
        .maybeSingle();

      if (existingConv) {
        rejected++;
        duplicateCount++;
        let errorMsg: string | null = null;
        if (existingConv.pipeline_id && existingConv.pipeline_id !== source.pipeline_id) {
          crossPipelineDuplicateCount++;
          const { data: owner } = await admin
            .from("pipelines")
            .select("name")
            .eq("id", existingConv.pipeline_id)
            .maybeSingle();
          errorMsg = `phone owned by pipeline ${owner?.name ?? existingConv.pipeline_id}`;
        }
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
          error: errorMsg,
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
        invalidCount++;
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
        invalid: invalidCount,
        ambiguous: ambiguousCount,
        duplicate: duplicateCount,
        cross_pipeline_duplicate: crossPipelineDuplicateCount,
        skipped_test_lead: testLeadCount,
        name_unusable: nameUnusableCount,
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
      invalid: invalidCount,
      ambiguous: ambiguousCount,
      duplicate: duplicateCount,
      cross_pipeline_duplicate: crossPipelineDuplicateCount,
      skipped_test_lead: testLeadCount,
      name_unusable: nameUnusableCount,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
