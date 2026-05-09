import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { applyDerivedVariables, validateRowAgainstProfile, type PrepProfile } from "./prepProfiles";

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
}): Promise<{ batchId: string; summary: ValidationSummary }> {
  const variableSchema = params.parsed.headers.filter((h) => h !== params.phoneColumn);

  const { data: batch, error: batchErr } = await supabase
    .from("audience_batches")
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
    })
    .select("id")
    .single();

  if (batchErr || !batch) throw batchErr ?? new Error("Failed to create batch");

  const seen = new Set<string>();
  let valid = 0, invalid = 0, duplicates = 0;
  const dbRows: Array<{
    batch_id: string;
    workspace_id: string;
    phone: string;
    payload: Record<string, string>;
    validation_status: "valid" | "invalid" | "duplicate";
  }> = [];

  for (const r of params.parsed.rows) {
    const rawPhone = r[params.phoneColumn];
    const norm = normalizePhone(rawPhone);
    const payload: Record<string, string> = {};
    for (const v of variableSchema) payload[v] = r[v] ?? "";
    if (!norm) {
      invalid++;
      const key = `__invalid__:${rawPhone || crypto.randomUUID()}:${invalid}`;
      dbRows.push({
        batch_id: batch.id,
        workspace_id: params.workspaceId,
        phone: key.slice(0, 64),
        payload,
        validation_status: "invalid",
      });
      continue;
    }
    if (seen.has(norm)) {
      duplicates++;
      dbRows.push({
        batch_id: batch.id,
        workspace_id: params.workspaceId,
        phone: `__dup__:${norm}:${duplicates}`,
        payload,
        validation_status: "duplicate",
      });
      continue;
    }
    seen.add(norm);
    valid++;
    dbRows.push({
      batch_id: batch.id,
      workspace_id: params.workspaceId,
      phone: norm,
      payload,
      validation_status: "valid",
    });
  }

  const CHUNK = 500;
  for (let i = 0; i < dbRows.length; i += CHUNK) {
    const slice = dbRows.slice(i, i + CHUNK);
    const { error } = await supabase.from("audience_rows").insert(slice);
    if (error) {
      await supabase.from("audience_batches").delete().eq("id", batch.id);
      throw error;
    }
  }

  return {
    batchId: batch.id,
    summary: { total: params.parsed.rows.length, valid, invalid, duplicates },
  };
}

/* ---------- Queries ---------- */

export async function fetchBatches(workspaceId: string): Promise<AudienceBatch[]> {
  const { data, error } = await supabase
    .from("audience_batches")
    .select("id, workspace_id, name, country, campaign_type, copy_profile, notes, variable_schema, source_filename, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ...b,
    variable_schema: Array.isArray(b.variable_schema) ? (b.variable_schema as string[]) : [],
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
  const { data, error } = await supabase
    .from("audience_rows")
    .select("id, batch_id, workspace_id, phone, payload, validation_status, usage_status, used_in_campaign_id, created_at")
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

export async function reserveRows(batchId: string, quantity: number | null): Promise<AudienceRow[]> {
  const { data, error } = await supabase.rpc("reserve_audience_rows", {
    _batch_id: batchId,
    _quantity: quantity ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as AudienceRow[];
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
