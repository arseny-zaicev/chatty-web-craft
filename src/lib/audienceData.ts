import { supabase } from "@/integrations/supabase/client";
import { applyDerivedVariables, applyColumnMapping, validateRowAgainstProfile, type PrepProfile } from "./prepProfiles";

// xlsx is ~600 KB minified; load it on demand only when the user actually uploads a spreadsheet.
const loadXLSX = () => import("xlsx");

export type AudienceBatch = {
  id: string;
  workspace_id: string;
  name: string;
  country: string | null;
  campaign_type: string;
  copy_profile: string | null;
  notes: string | null;
  variable_schema: string[];
  source_filename: string | null;
  created_at: string;
  prep_profile_id: string | null;
  is_launch_ready: boolean;
  derived_variables_preview: Array<Record<string, string>>;
};

/** Parse the `__static_values__=<json>` line we stash in audience_batches.notes. */
export function parseStaticValues(notes: string | null | undefined): Record<string, string> {
  if (!notes) return {};
  const m = notes.match(/^__static_values__=(\{[^\n]*\})/);
  if (!m) return {};
  try { return JSON.parse(m[1]) as Record<string, string>; } catch { return {}; }
}

export type AudienceBatchStats = {
  batch_id: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  unused: number;
  reserved: number;
  scheduled: number;
  used: number;
};

export type AudienceRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  phone: string;
  payload: Record<string, string>;
  validation_status: "valid" | "invalid" | "duplicate";
  usage_status: "unused" | "reserved" | "scheduled" | "used";
  used_in_campaign_id: string | null;
  created_at: string;
  derived_payload: Record<string, string>;
};

export const audienceKeys = {
  batches: (wid?: string) => ["audience", "batches", wid ?? "none"] as const,
  stats: (wid?: string) => ["audience", "stats", wid ?? "none"] as const,
  rows: (batchId: string) => ["audience", "rows", batchId] as const,
};

/* ---------- Parsing ---------- */

export type ParsedAudience = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

const PHONE_KEYS = ["phone", "phone_number", "phonenumber", "mobile", "msisdn", "tel", "number", "whatsapp", "wa"];

export const detectPhoneColumn = (headers: string[]): string | null => {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const k of PHONE_KEYS) {
    const idx = lower.indexOf(k);
    if (idx !== -1) return headers[idx];
  }
  return null;
};

export const normalizePhone = (raw: string): string | null => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  let digits = cleaned.replace(/^\+/, "");
  digits = digits.replace(/^00+/, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
};

export async function parseAudienceFile(file: File): Promise<ParsedAudience> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const text = await file.text();
    return parseDelimited(text);
  }
  const buf = await file.arrayBuffer();
  const XLSX = await loadXLSX();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  if (json.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(json[0]);
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? "").trim();
    return out;
  });
  return { headers, rows };
}

function parseDelimited(text: string): ParsedAudience {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === delim) { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const parts = splitLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

/* ---------- Validation + insertion ---------- */

export type ValidationSummary = {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
};

export async function uploadBatch(params: {
  workspaceId: string;
  userId: string;
  name: string;
  country: string | null;
  campaignType: "marketing" | "utility";
  copyProfile: string | null;
  notes: string | null;
  parsed: ParsedAudience;
  phoneColumn: string;
  sourceFilename: string | null;
  prepProfile?: PrepProfile | null;
  /** sourceColumn -> profileField (e.g. "Full Name" -> "first_name") */
  columnMapping?: Record<string, string>;
}): Promise<{ batchId: string; summary: ValidationSummary; isLaunchReady: boolean }> {
  const mapping = params.columnMapping ?? {};
  // The variable_schema we store should reflect the mapped field names actually used downstream.
  const mappedFields = new Set<string>();
  for (const h of params.parsed.headers) {
    if (h === params.phoneColumn) continue;
    mappedFields.add(mapping[h] && mapping[h] !== "" ? mapping[h] : h);
  }
  const variableSchema = Array.from(mappedFields);
  const profile = params.prepProfile ?? null;

  const seen = new Set<string>();
  let valid = 0, invalid = 0, duplicates = 0;
  type StagedRow = {
    workspace_id: string;
    phone: string;
    payload: Record<string, string>;
    validation_status: "valid" | "invalid" | "duplicate";
    derived_payload: Record<string, string>;
  };
  const staged: StagedRow[] = [];
  const derivedPreview: Array<Record<string, string>> = [];

  for (const r of params.parsed.rows) {
    const rawPhone = r[params.phoneColumn];
    const norm = normalizePhone(rawPhone);
    // 1) Apply column mapping deterministically (raw col -> profile field)
    const sourceMinusPhone: Record<string, string> = {};
    for (const h of params.parsed.headers) {
      if (h === params.phoneColumn) continue;
      sourceMinusPhone[h] = r[h] ?? "";
    }
    const mapped = applyColumnMapping(sourceMinusPhone, mapping);
    // 2) The stored payload uses the mapped field names (so downstream sees expected keys)
    const payload: Record<string, string> = {};
    for (const v of variableSchema) payload[v] = mapped[v] ?? "";

    let derived: Record<string, string> = {};
    let profileFail = false;
    if (profile) {
      const v = validateRowAgainstProfile(profile, payload);
      if (!v.ok) profileFail = true;
      derived = applyDerivedVariables(profile, payload);
    }

    if (!norm || profileFail) {
      invalid++;
      const key = `__invalid__:${rawPhone || crypto.randomUUID()}:${invalid}`;
      staged.push({
        workspace_id: params.workspaceId,
        phone: key.slice(0, 64),
        payload,
        validation_status: "invalid",
        derived_payload: derived,
      });
      continue;
    }
    if (seen.has(norm)) {
      duplicates++;
      staged.push({
        workspace_id: params.workspaceId,
        phone: `__dup__:${norm}:${duplicates}`,
        payload,
        validation_status: "duplicate",
        derived_payload: derived,
      });
      continue;
    }
    seen.add(norm);
    valid++;
    if (derivedPreview.length < 3 && Object.keys(derived).length > 0) derivedPreview.push(derived);
    staged.push({
      workspace_id: params.workspaceId,
      phone: norm,
      payload,
      validation_status: "valid",
      derived_payload: derived,
    });
  }

  const isLaunchReady = !!profile && valid > 0;

  const { data: batch, error: batchErr } = await (supabase
    .from("audience_batches") as any)
    .insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      name: params.name,
      country: params.country,
      campaign_type: params.campaignType,
      copy_profile: params.copyProfile,
      notes: params.notes,
      variable_schema: variableSchema,
      source_filename: params.sourceFilename,
      prep_profile_id: profile?.id ?? null,
      is_launch_ready: isLaunchReady,
      derived_variables_preview: derivedPreview,
      column_mapping: mapping,
    })
    .select("id")
    .single();

  if (batchErr || !batch) throw batchErr ?? new Error("Failed to create batch");

  const dbRows = staged.map((s) => ({ batch_id: batch.id, ...s }));

  const CHUNK = 500;
  for (let i = 0; i < dbRows.length; i += CHUNK) {
    const slice = dbRows.slice(i, i + CHUNK);
    const { error } = await supabase.from("audience_rows").insert(slice as never);
    if (error) {
      await supabase.from("audience_batches").delete().eq("id", batch.id);
      throw error;
    }
  }

  return {
    batchId: batch.id,
    summary: { total: params.parsed.rows.length, valid, invalid, duplicates },
    isLaunchReady,
  };
}

/* ---------- Queries ---------- */

export async function fetchBatches(workspaceId: string): Promise<AudienceBatch[]> {
  const { data, error } = await (supabase
    .from("audience_batches") as any)
    .select("id, workspace_id, name, country, campaign_type, copy_profile, notes, variable_schema, source_filename, created_at, prep_profile_id, is_launch_ready, derived_variables_preview")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b: any) => ({
    ...b,
    variable_schema: Array.isArray(b.variable_schema) ? (b.variable_schema as string[]) : [],
    is_launch_ready: !!b.is_launch_ready,
    derived_variables_preview: Array.isArray(b.derived_variables_preview) ? b.derived_variables_preview : [],
  })) as AudienceBatch[];
}

export async function fetchBatchStats(workspaceId: string): Promise<AudienceBatchStats[]> {
  const { data, error } = await supabase
    .from("audience_batch_stats" as never)
    .select("*")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (data ?? []) as unknown as AudienceBatchStats[];
}

export async function fetchBatchRows(batchId: string, limit = 200): Promise<AudienceRow[]> {
  const { data, error } = await (supabase
    .from("audience_rows") as any)
    .select("id, batch_id, workspace_id, phone, payload, validation_status, usage_status, used_in_campaign_id, created_at, derived_payload")
    .eq("batch_id", batchId)
    .order("created_at")
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AudienceRow[];
}

export async function deleteBatch(batchId: string): Promise<void> {
  const { error } = await supabase.from("audience_batches").delete().eq("id", batchId);
  if (error) throw error;
}

/* ---------- Reservation (used by Launch) ---------- */

// PostgREST caps SETOF responses at db.max_rows (1000 by default), even though
// the RPC mutates more rows under the hood. We chunk the reservation in batches
// of 500 so the SDK actually returns every reserved row to us — otherwise rows
// get marked `reserved` server-side but never returned to the caller, leaving
// them stuck forever and silently truncating campaigns to 1000 recipients.
const RESERVE_CHUNK = 500;

export async function reserveRows(batchId: string, quantity: number | null): Promise<AudienceRow[]> {
  const target = quantity == null ? Number.POSITIVE_INFINITY : Math.max(0, quantity);
  if (target === 0) return [];

  const collected: AudienceRow[] = [];
  // Loop until we've collected `target` rows or the RPC returns empty (pool drained).
  while (collected.length < target) {
    const remaining = target === Number.POSITIVE_INFINITY
      ? RESERVE_CHUNK
      : Math.min(RESERVE_CHUNK, target - collected.length);
    const { data, error } = await supabase.rpc("reserve_audience_rows", {
      _batch_id: batchId,
      _quantity: remaining,
    });
    if (error) {
      // Roll back anything we already grabbed so it doesn't sit as orphan `reserved`.
      if (collected.length > 0) {
        await supabase.rpc("release_audience_rows", { _row_ids: collected.map((r) => r.id) }).catch(() => {});
      }
      throw error;
    }
    const batch = (data ?? []) as AudienceRow[];
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < remaining) break; // pool drained
  }
  return collected;
}

export async function markRowsUsed(rowIds: string[], campaignId: string): Promise<number> {
  if (rowIds.length === 0) return 0;
  const { data, error } = await supabase.rpc("mark_audience_rows_used", {
    _row_ids: rowIds,
    _campaign_id: campaignId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function releaseRows(rowIds: string[]): Promise<number> {
  if (rowIds.length === 0) return 0;
  const { data, error } = await supabase.rpc("release_audience_rows", { _row_ids: rowIds });
  if (error) throw error;
  return (data as number) ?? 0;
}
