// google-sheets-sync: pulls new rows from a Google Sheet (via Lovable
// connector gateway) into lead_imports for a single source_connection.
//
// Body: { source_connection_id: string, secret_token?: string }
// Auth: caller must be a workspace_manager of the source's workspace, OR
//       request must come with the source secret token / service role key (cron).
//
// Source config (source_connections.config jsonb):
//   {
//     spreadsheet_id: string,         // extracted from sheet URL
//     sheet_name: string,             // tab name, e.g. "Sheet1"
//     phone_column: string,           // header value OR column letter
//     name_column?: string,           // optional
//     header_row?: number,            // default 1
//     last_synced_row?: number        // updated by this function
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizePhone } from "../_shared/phone.ts";
import { normalizeFirstName } from "../_shared/name.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Returns true if the raw value is a Meta-style test-lead placeholder.
function isTestLeadValue(raw: unknown): boolean {
  if (raw == null) return false;
  return /<\s*test\s+lead/i.test(String(raw));
}

// Convert column letter (A, B, AA) to 0-based index
function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) {
    if (c < "A" || c > "Z") return -1;
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

// Resolve "phone" config: header name OR column letter -> 0-based index
function resolveColumnIndex(spec: string | undefined, headers: string[]): number {
  if (!spec) return -1;
  const trimmed = spec.trim();
  if (!trimmed) return -1;
  // Try as header label (case-insensitive)
  const headerIdx = headers.findIndex((h) => h.trim().toLowerCase() === trimmed.toLowerCase());
  if (headerIdx >= 0) return headerIdx;
  // Try as letter
  if (/^[A-Za-z]+$/.test(trimmed)) {
    const idx = colLetterToIndex(trimmed);
    if (idx >= 0) return idx;
  }
  return -1;
}

function chunks<T>(items: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function bulkInsertLeadImports(admin: any, rows: Record<string, unknown>[]) {
  for (const part of chunks(rows, 400)) {
    const { error } = await admin.from("lead_imports").insert(part);
    if (!error) continue;

    // A concurrent/manual sync can race on the source+row unique index. Fall
    // back to row-by-row so one duplicate does not discard the whole chunk.
    for (const row of part) {
      const { error: rowErr } = await admin.from("lead_imports").insert(row);
      if (rowErr && rowErr.code !== "23505") console.error("lead_import_insert_failed", rowErr.message);
    }
  }
}

// Sync logic for one source. Returns a result object.
async function syncOne(admin: any, source: any): Promise<Record<string, unknown>> {
  if (source.kind !== "google_sheet") return { source_id: source.id, error: "Not a Google Sheet source" };
  if (source.status !== "active") return { source_id: source.id, error: `Source is ${source.status}` };
  return await runSync(admin, source);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);
    if (!GOOGLE_SHEETS_API_KEY) return json({ error: "Google Sheets connector not linked" }, 500);

    const body = await req.json().catch(() => ({}));
    const sourceId = body?.source_connection_id;
    const sourceToken = typeof body?.secret_token === "string" ? body.secret_token : "";
    const syncAll = body?.all === true;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Heartbeat (best-effort)
    admin.from("system_heartbeats").upsert({
      name: "google-sheets-sync",
      last_run_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    // Authorize: workspace manager OR source secret token / service-role bearer.
    const authHeader = req.headers.get("Authorization") || "";
    const isService = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

    // Cron / service-role bulk sync of all active Google Sheet sources.
    if (syncAll) {
      if (!isService) return json({ error: "all=true requires service role" }, 403);
      const { data: sources } = await admin
        .from("source_connections")
        .select("id, workspace_id, pipeline_id, kind, name, config, status")
        .eq("kind", "google_sheet")
        .eq("status", "active");
      const results: any[] = [];
      for (const s of sources ?? []) {
        try {
          results.push(await syncOne(admin, s));
        } catch (e) {
          results.push({ source_id: s.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return json({ ok: true, count: results.length, results });
    }

    if (!sourceId || typeof sourceId !== "string") return json({ error: "source_connection_id required" }, 400);

    const { data: source } = await admin
      .from("source_connections")
      .select("id, workspace_id, pipeline_id, kind, name, config, status, secret_token")
      .eq("id", sourceId)
      .maybeSingle();
    if (!source) return json({ error: "Source not found" }, 404);
    if (source.kind !== "google_sheet") return json({ error: "Not a Google Sheet source" }, 400);
    if (source.status !== "active") return json({ error: `Source is ${source.status}` }, 423);

    const isSourceToken = Boolean(sourceToken && source.secret_token && sourceToken === source.secret_token);
    if (!isService && !isSourceToken) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isManager } = await admin.rpc("is_workspace_manager", {
        _workspace_id: source.workspace_id,
        _user_id: u.user.id,
      });
      if (!isManager) return json({ error: "Forbidden" }, 403);
    }

    const out = await runSync(admin, source);
    if ((out as any).error) return json(out, 502);
    return json(out);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function runSync(admin: any, source: any): Promise<Record<string, unknown>> {
  try {
    const cfg = (source.config ?? {}) as Record<string, any>;
    const spreadsheetId = String(cfg.spreadsheet_id || "").trim();
    const sheetName = String(cfg.sheet_name || "Sheet1").trim();
    const phoneSpec = cfg.phone_column ? String(cfg.phone_column) : "";
    const nameSpec = cfg.name_column ? String(cfg.name_column) : "";
    const headerRow = Number.isFinite(cfg.header_row) ? Math.max(1, Math.floor(cfg.header_row)) : 1;
    let lastSyncedRow = Number.isFinite(cfg.last_synced_row) ? Math.max(headerRow, Math.floor(cfg.last_synced_row)) : headerRow;

    if (!spreadsheetId) return { error: "config.spreadsheet_id missing" };
    if (!phoneSpec) return { error: "config.phone_column missing" };

    const markHealthySync = async (nextConfig = cfg) => {
      await admin
        .from("source_connections")
        .update({
          config: nextConfig,
          last_ingest_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", source.id);
    };

    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id, auto_outreach_enabled, slack_channel_id")
      .eq("id", source.pipeline_id)
      .maybeSingle();
    if (!pipeline) return { error: "Pipeline missing" };

    // 1. Read whole sheet (A:Z is enough for MVP, ~26 cols).
    // Sheet names with spaces/special chars (e.g. "PPC-Overview (1)") MUST be wrapped in single quotes
    // and URL-encoded. Keep the `:` raw — Sheets API rejects %3A in ranges.
    const needsQuote = /[^A-Za-z0-9_]/.test(sheetName);
    const quotedSheet = needsQuote ? `'${sheetName.replace(/'/g, "''")}'` : sheetName;
    const range = `${quotedSheet}!A:Z`;
    const encodedRange = encodeURIComponent(range).replace(/%3A/gi, ":").replace(/%21/g, "!");
    const sheetUrl = `${GATEWAY_URL}/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
    const sheetResp = await fetch(sheetUrl, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
      },
    });
    if (!sheetResp.ok) {
      const errText = await sheetResp.text();
      await admin
        .from("source_connections")
        .update({ last_error: `sheets_api_${sheetResp.status}: ${errText.slice(0, 300)}` })
        .eq("id", source.id);
      return { error: `Sheets API ${sheetResp.status}: ${errText.slice(0, 300)}` };
    }
    const sheetData = await sheetResp.json();
    const rows: string[][] = (sheetData?.values ?? []) as string[][];
    if (rows.length === 0) {
      await markHealthySync();
      return { ok: true, total: 0, accepted: 0, rejected: 0, message: "Sheet empty" };
    }

    const headers = rows[headerRow - 1] ?? [];
    const phoneIdx = resolveColumnIndex(phoneSpec, headers);
    const nameIdx = resolveColumnIndex(nameSpec, headers);
    if (phoneIdx < 0) {
      const error = `phone_column "${phoneSpec}" not found`;
      await admin.from("source_connections").update({ last_error: error }).eq("id", source.id);
      return { error };
    }

    // Slice new rows: 1-based row number > lastSyncedRow
    const startIdx = Math.max(headerRow, lastSyncedRow); // 1-based last processed row
    const newRows = rows.slice(startIdx); // these are rows with 1-based index startIdx+1..rows.length
    if (newRows.length === 0) {
      await markHealthySync();
      return { ok: true, total: 0, accepted: 0, rejected: 0, message: "No new rows" };
    }

    // 2. Open import batch
    const { data: batch, error: batchErr } = await admin
      .from("import_batches")
      .insert({
        workspace_id: source.workspace_id,
        pipeline_id: source.pipeline_id,
        source_connection_id: source.id,
        source_kind: "google_sheet",
        status: "processing",
        total: newRows.length,
      })
      .select("id")
      .single();
    if (batchErr || !batch) return { error: batchErr?.message ?? "Could not open batch" };

    let accepted = 0;
    let rejected = 0;
    let invalidCount = 0;
    let ambiguousCount = 0;
    let testLeadCount = 0;
    let duplicateCount = 0;
    let crossPipelineDuplicateCount = 0;
    let nameUnusableCount = 0;
    let lastProcessedRow = lastSyncedRow;
    const initialStatus = pipeline.auto_outreach_enabled ? "pending" : "awaiting_manual";
    const defaultCC = cfg.default_country_code ? String(cfg.default_country_code) : null;
    const leadImportRows: Record<string, unknown>[] = [];

    // Cache resolved owning-pipeline names so we don't lookup the same name
    // 200 times for a Sheet that's full of duplicates of the other pipeline.
    const pipelineNameCache = new Map<string, string>();
    pipelineNameCache.set(source.pipeline_id, "");
    const ownerName = async (pid: string): Promise<string> => {
      if (pipelineNameCache.has(pid)) return pipelineNameCache.get(pid)!;
      const { data } = await admin.from("pipelines").select("name").eq("id", pid).maybeSingle();
      const n = (data as any)?.name ?? pid;
      pipelineNameCache.set(pid, n);
      return n;
    };

    const normalizedRows: any[] = [];
    const phonesToCheck = new Set<string>();

    // 3. Validate + dedupe + import
    for (let i = 0; i < newRows.length; i++) {
      const sheetRowNumber = startIdx + i + 1; // 1-based
      const row = newRows[i] ?? [];
      const phoneRaw = row[phoneIdx];
      const nameRawCell = nameIdx >= 0 ? row[nameIdx] : null;
      const isTestName = isTestLeadValue(nameRawCell);
      const nameResult = !isTestName ? normalizeFirstName(nameRawCell) : { value: null, raw: nameRawCell == null ? null : String(nameRawCell), outcome: "unusable" as const };
      const name = nameResult.value;
      if (nameResult.outcome === "unusable" && nameRawCell != null && String(nameRawCell).trim() !== "") nameUnusableCount++;
      const externalId = `row-${sheetRowNumber}`;
      const payload: Record<string, unknown> = {
        _sheet_row: sheetRowNumber,
        _phone_raw: phoneRaw == null ? "" : String(phoneRaw),
        _first_name_raw: nameResult.raw ?? null,
        _first_name_outcome: nameResult.outcome,
      };
      headers.forEach((h, idx) => {
        if (h && row[idx] != null && row[idx] !== "") payload[h] = row[idx];
      });

      lastProcessedRow = sheetRowNumber;

      // Skip Meta test-lead rows entirely
      if (isTestLeadValue(phoneRaw) || isTestLeadValue(nameRawCell)) {
        rejected++;
        testLeadCount++;
        await admin.from("lead_imports").insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone: String(phoneRaw ?? "").slice(0, 32),
          name,
          payload,
          status: "invalid",
          error: "Test lead (skipped)",
        });
        continue;
      }

      const phoneResult = normalizePhone(phoneRaw, defaultCC);
      if (!phoneResult.ok) {
        rejected++;
        if (phoneResult.status === "ambiguous") ambiguousCount++;
        else invalidCount++;
        await admin.from("lead_imports").insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone: String(phoneRaw ?? "").slice(0, 32),
          name,
          payload,
          status: "invalid",
          error: phoneResult.reason,
        });
        continue;
      }
      const phone = phoneResult.phone;

      // Owning-pipeline rule: a conversation sticks to the pipeline that
      // created it. If the same phone re-appears via a source wired to a
      // DIFFERENT pipeline, we record a duplicate row pointing at the existing
      // conversation and surface "owned by <pipeline>" so the operator can see
      // why it was not first-touched again.
      const { data: existingConv } = await admin
        .from("conversations")
        .select("id, pipeline_id")
        .eq("workspace_id", source.workspace_id)
        .eq("contact_phone", phone)
        .maybeSingle();
      if (existingConv) {
        rejected++;
        duplicateCount++;
        let errMsg: string | null = null;
        if (existingConv.pipeline_id && existingConv.pipeline_id !== source.pipeline_id) {
          crossPipelineDuplicateCount++;
          errMsg = `phone owned by pipeline ${await ownerName(existingConv.pipeline_id)}`;
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
          error: errMsg,
        });
        continue;
      }

      // Per-pipeline lead_imports dedupe (avoid re-importing the same phone
      // twice into the SAME pipeline on a re-sync before the conversation
      // exists). Scope is intentionally per-pipeline now — the old
      // workspace-wide check leaked across Warm/Reactivation pipelines.
      const { data: existingLead } = await admin
        .from("lead_imports")
        .select("id")
        .eq("workspace_id", source.workspace_id)
        .eq("pipeline_id", source.pipeline_id)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      if (existingLead) {
        rejected++;
        duplicateCount++;
        await admin.from("lead_imports").insert({
          workspace_id: source.workspace_id,
          pipeline_id: source.pipeline_id,
          batch_id: batch.id,
          source_connection_id: source.id,
          external_id: externalId,
          phone,
          name,
          payload,
          status: "duplicate",
        });
        continue;
      }

      const { error: impErr } = await admin.from("lead_imports").insert({
        workspace_id: source.workspace_id,
        pipeline_id: source.pipeline_id,
        batch_id: batch.id,
        source_connection_id: source.id,
        external_id: externalId,
        phone,
        name,
        payload,
        status: initialStatus,
      });
      if (impErr) {
        rejected++;
        invalidCount++;
        continue;
      }
      accepted++;
    }

    // 4. Close batch + update source cursor
    await admin
      .from("import_batches")
      .update({
        status: rejected === newRows.length ? "failed" : "completed",
        accepted,
        rejected,
        finished_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    const newConfig = { ...cfg, last_synced_row: lastProcessedRow };
    await admin
      .from("source_connections")
      .update({
        config: newConfig,
        last_ingest_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", source.id);

    // 5. Slack event
    await admin.from("slack_event_queue").insert({
      event_type: rejected === newRows.length ? "lead.import_failed" : "lead.imported",
      workspace_id: source.workspace_id,
      payload: {
        source_id: source.id,
        source_name: source.name,
        source_kind: "google_sheet",
        pipeline_id: source.pipeline_id,
        batch_id: batch.id,
        total: newRows.length,
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

    return {
      ok: true,
      source_id: source.id,
      source_name: source.name,
      batch_id: batch.id,
      total: newRows.length,
      accepted,
      rejected,
      invalid: invalidCount,
      ambiguous: ambiguousCount,
      duplicate: duplicateCount,
      cross_pipeline_duplicate: crossPipelineDuplicateCount,
      skipped_test_lead: testLeadCount,
      name_unusable: nameUnusableCount,
      last_synced_row: lastProcessedRow,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
