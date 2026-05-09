import { supabase } from "@/integrations/supabase/client";

export type DerivedStrategy = "field" | "template" | "static";
export type DerivedVariable = {
  key: string;             // e.g. "var_1"
  strategy: DerivedStrategy;
  source?: string;         // for "field": source column name
  template?: string;       // for "template": e.g. "a demo system for {company}"
  static?: string;         // for "static": literal value
  fallback?: string;       // applied when result is empty
};

export type InvalidRule = {
  field: string;
  rule: "non_empty" | "min_length" | "regex";
  value?: string;          // for min_length (number-as-string) or regex pattern
};

export type PrepProfile = {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  description: string | null;
  campaign_type: "marketing" | "utility";
  template_label: string | null;
  required_fields: string[];
  optional_fields: string[];
  derived_variables: DerivedVariable[];
  invalid_rules: InvalidRule[];
  fallback_rules: Record<string, string>;
  quick_replies: string[];
  sample_payload: Record<string, string>;
  /** The actual WhatsApp message body, with {var_1}, {first_name}, etc. Used to render a deterministic preview. */
  sample_message_template: string | null;
  created_at: string;
  updated_at: string;
};

export const prepProfileKeys = {
  list: (wid?: string) => ["prep-profiles", wid ?? "none"] as const,
};

const fromRow = (r: Record<string, unknown>): PrepProfile => ({
  id: r.id as string,
  workspace_id: r.workspace_id as string,
  user_id: r.user_id as string,
  name: r.name as string,
  description: (r.description as string) ?? null,
  campaign_type: (r.campaign_type as "marketing" | "utility") ?? "marketing",
  template_label: (r.template_label as string) ?? null,
  required_fields: Array.isArray(r.required_fields) ? (r.required_fields as string[]) : [],
  optional_fields: Array.isArray(r.optional_fields) ? (r.optional_fields as string[]) : [],
  derived_variables: Array.isArray(r.derived_variables) ? (r.derived_variables as DerivedVariable[]) : [],
  invalid_rules: Array.isArray(r.invalid_rules) ? (r.invalid_rules as InvalidRule[]) : [],
  fallback_rules: (r.fallback_rules as Record<string, string>) ?? {},
  quick_replies: Array.isArray(r.quick_replies) ? (r.quick_replies as string[]) : [],
  sample_payload: (r.sample_payload as Record<string, string>) ?? {},
  sample_message_template: (r.sample_message_template as string) ?? null,
  created_at: r.created_at as string,
  updated_at: r.updated_at as string,
});

export async function listPrepProfiles(workspaceId: string): Promise<PrepProfile[]> {
  const { data, error } = await supabase
    .from("audience_prep_profiles" as never)
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
}

export async function upsertPrepProfile(
  p: Partial<PrepProfile> & { workspace_id: string; user_id: string; name: string },
): Promise<PrepProfile> {
  const payload = {
    id: p.id,
    workspace_id: p.workspace_id,
    user_id: p.user_id,
    name: p.name,
    description: p.description ?? null,
    campaign_type: p.campaign_type ?? "marketing",
    template_label: p.template_label ?? null,
    required_fields: p.required_fields ?? [],
    optional_fields: p.optional_fields ?? [],
    derived_variables: p.derived_variables ?? [],
    invalid_rules: p.invalid_rules ?? [],
    fallback_rules: p.fallback_rules ?? {},
    quick_replies: p.quick_replies ?? [],
    sample_payload: p.sample_payload ?? {},
    sample_message_template: p.sample_message_template ?? null,
  };
  const tbl = supabase.from("audience_prep_profiles" as never) as any;
  const q = p.id
    ? tbl.update(payload).eq("id", p.id).select("*").single()
    : tbl.insert(payload).select("*").single();
  const { data, error } = await q;
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function deletePrepProfile(id: string): Promise<void> {
  const { error } = await supabase.from("audience_prep_profiles" as never).delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Render / validate ---------- */

export function renderTemplate(
  tpl: string,
  row: Record<string, string>,
  fallbacks: Record<string, string>,
): string {
  return tpl.replace(/\{([\w.-]+)\}/g, (_m, key: string) => {
    const v = row[key];
    if (v != null && String(v).trim() !== "") return String(v);
    const fb = fallbacks[key];
    return fb != null ? String(fb) : "";
  });
}

export function applyDerivedVariables(
  profile: PrepProfile,
  row: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dv of profile.derived_variables) {
    let val = "";
    if (dv.strategy === "static") {
      val = dv.static ?? "";
    } else if (dv.strategy === "field") {
      val = String(row[dv.source ?? ""] ?? "").trim();
    } else if (dv.strategy === "template") {
      val = renderTemplate(dv.template ?? "", row, profile.fallback_rules).trim();
    }
    if (!val && dv.fallback) val = dv.fallback;
    out[dv.key] = val;
  }
  return out;
}

export type RowValidation = {
  ok: boolean;
  errors: string[];
};

export function validateRowAgainstProfile(
  profile: PrepProfile,
  row: Record<string, string>,
): RowValidation {
  const errors: string[] = [];
  for (const f of profile.required_fields) {
    const v = row[f];
    const fb = profile.fallback_rules[f];
    if ((v == null || String(v).trim() === "") && (fb == null || fb === "")) {
      errors.push(`missing ${f}`);
    }
  }
  for (const r of profile.invalid_rules) {
    const v = String(row[r.field] ?? "").trim();
    if (r.rule === "non_empty" && !v) errors.push(`${r.field} empty`);
    if (r.rule === "min_length") {
      const n = Number(r.value ?? "0");
      if (v.length < n) errors.push(`${r.field}<${n} chars`);
    }
    if (r.rule === "regex" && r.value) {
      try {
        if (!new RegExp(r.value).test(v)) errors.push(`${r.field} regex fail`);
      } catch {
        /* ignore bad regex */
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Apply a column mapping (sourceColumn -> profileField) to a raw row.
 * Unmapped columns are passed through unchanged so nothing is lost.
 */
export function applyColumnMapping(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...row };
  for (const [src, dest] of Object.entries(mapping)) {
    if (!dest || src === dest) continue;
    if (row[src] != null && (out[dest] == null || out[dest] === "")) out[dest] = row[src];
  }
  return out;
}

/**
 * Render the saved sample_message_template using a row's payload + derived vars.
 * Returns null if no template is defined on the profile.
 */
export function renderSampleMessage(
  profile: PrepProfile,
  row: Record<string, string>,
): string | null {
  if (!profile.sample_message_template) return null;
  const derived = applyDerivedVariables(profile, row);
  const merged: Record<string, string> = { ...row, ...derived };
  return renderTemplate(profile.sample_message_template, merged, profile.fallback_rules);
}

/* ---------- Prompt builders (Codex / fallback) ---------- */

const ph = (s: string | null | undefined, fb = "—") =>
  s && String(s).trim() !== "" ? String(s) : fb;

/**
 * Strict prep prompt for the primary path: prepare/validate audience in Codex,
 * then insert rows into the company's audience batch in Supabase.
 */
export function buildPrepPrompt(
  profile: PrepProfile,
  ctx: { workspaceName: string; workspaceId: string; batchId?: string },
): string {
  const required = profile.required_fields.length ? profile.required_fields.join(", ") : "(none defined)";
  const optional = profile.optional_fields.length ? profile.optional_fields.join(", ") : "(none)";
  const derivedLines = profile.derived_variables.length === 0
    ? "  (no derived variables defined)"
    : profile.derived_variables.map((d) => {
        const detail =
          d.strategy === "field" ? `from source column "${ph(d.source)}"` :
          d.strategy === "template" ? `template = "${ph(d.template)}"` :
          `static = "${ph(d.static)}"`;
        const fb = d.fallback ? `; fallback = "${d.fallback}"` : "";
        return `  - ${d.key}: ${d.strategy} ${detail}${fb}`;
      }).join("\n");
  const invalidLines = profile.invalid_rules.length === 0
    ? "  (no extra invalid rules)"
    : profile.invalid_rules.map((r) =>
        `  - ${r.field}: ${r.rule}${r.value ? ` (${r.value})` : ""}`).join("\n");
  const fallbackLines = Object.keys(profile.fallback_rules).length === 0
    ? "  (no field-level fallbacks)"
    : Object.entries(profile.fallback_rules).map(([k, v]) => `  - ${k} -> "${v}"`).join("\n");
  const quick = profile.quick_replies.length ? profile.quick_replies.join(" | ") : "(none)";

  return `You are preparing an audience batch for the "${ctx.workspaceName}" workspace.

PREP PROFILE: ${profile.name}
Campaign type: ${profile.campaign_type}
Logical template / copy: ${ph(profile.template_label)}
${profile.description ? `Notes: ${profile.description}\n` : ""}
GOAL
Take the raw input rows the operator gives you and produce a clean, validated dataset that can be inserted directly into the audience_rows table for this workspace.

REQUIRED SOURCE FIELDS (must be present and non-empty unless a fallback covers them)
${required}

OPTIONAL SOURCE FIELDS
${optional}

VALIDATION RULES
  - phone is required, normalised to digits only (no +, no spaces)
  - phone length 7-15
  - in-batch duplicate phones must be removed
${invalidLines}

FALLBACKS WHEN A FIELD IS MISSING
${fallbackLines}

DERIVED LAUNCH VARIABLES (computed per row, stored in derived_payload)
${derivedLines}

QUICK REPLIES (informational only)
${quick}
${profile.sample_message_template ? `\nSAMPLE MESSAGE BODY (template; placeholders are derived variables and source fields)\n"""\n${profile.sample_message_template}\n"""\n` : ""}

OUTPUT (one JSON array; one object per valid row)
[
  {
    "phone": "9715xxxxxxxx",
    "payload": { /* original source columns minus phone */ },
    "derived_payload": { ${profile.derived_variables.map((d) => `"${d.key}": "..."`).join(", ") || ""} },
    "validation_status": "valid"
  }
]

INSERT TARGET (Supabase)
  table: public.audience_rows
  workspace_id: ${ctx.workspaceId}
  batch_id: ${ctx.batchId ?? "<paste the batch id from the Data page>"}
  prep_profile_id: ${profile.id}

DO NOT
  - invent values that are not present and not covered by a fallback
  - include rows that fail required-field or invalid-rule checks
  - re-use phones that already exist as "used" in this workspace`;
}

/**
 * Lightweight fallback prompt for the operator path:
 * what to put into a CSV/XLSX so the in-app Upload audience flow accepts it.
 */
export function buildFallbackPrompt(profile: PrepProfile): string {
  const required = profile.required_fields.length ? profile.required_fields.join(", ") : "(none)";
  const optional = profile.optional_fields.length ? profile.optional_fields.join(", ") : "(none)";
  const derived = profile.derived_variables.length === 0
    ? "(none defined)"
    : profile.derived_variables.map((d) =>
        d.strategy === "field" ? `${d.key} <- ${ph(d.source)}` :
        d.strategy === "template" ? `${d.key} <- "${ph(d.template)}"` :
        `${d.key} = "${ph(d.static)}"`).join("; ");
  return `Fallback path: prepare a CSV/XLSX for the in-app Upload audience flow.

Profile: ${profile.name} (${profile.campaign_type})
Template: ${ph(profile.template_label)}

Columns:
  - phone (required, digits only or with +, will be normalised)
  - ${required}  (required)
  - ${optional}  (optional)

Derived variables (rendered automatically once uploaded):
  ${derived}

Rules:
  - one row per contact; no duplicate phones
  - leave a cell empty only if the profile defines a fallback for that field
  - do not pre-render derived variables — the app does that during upload`;
}

export type DerivedCoverage = { key: string; covered: number; total: number };

export function computeDerivedCoverage(
  profile: PrepProfile,
  rows: Array<{ derived_payload?: Record<string, string> | null }>,
): DerivedCoverage[] {
  const total = rows.length || 0;
  return profile.derived_variables.map((dv) => {
    let covered = 0;
    for (const r of rows) {
      const v = r.derived_payload?.[dv.key];
      if (v != null && String(v).trim() !== "") covered++;
    }
    return { key: dv.key, covered, total };
  });
}
