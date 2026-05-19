import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { WhatsAppNumber } from "./crmData";

// ---------- Types ----------

export type Template = Pick<
  Tables<"message_templates">,
  "id" | "name" | "language" | "status" | "category" | "body" | "whatsapp_number_id" | "workspace_id" | "variables" | "buttons" | "provider_template_id" | "synced_at" | "variables_sample" | "header_text" | "footer_text" | "sync_warning"
>;

export type Recipient = {
  phone: string;
  name?: string;
  variables?: Record<string, string>;
  conversation_id?: string;
};

export type CampaignType = "marketing" | "utility";

export type LogicalTemplate = {
  key: string; // normalized
  label: string; // display
  category: "marketing" | "utility" | "authentication";
  variables: string[]; // unioned vars across variants
  body: string | null; // sample body (first variant)
  // Sample copy for each variable index (aligned with `variables`).
  // Pulled from Gupshup template "Sample" field at sync time.
  variablesSample: string[];
  variants: Template[]; // approved/paused variants across numbers
  variantByNumber: Map<string, Template>;
};

// ---------- Queries ----------

export async function fetchLaunchEssentials(workspaceId?: string) {
  let numbersQuery = supabase
    .from("whatsapp_numbers")
    .select("id, phone_number, display_name, label, workspace_id, is_active, provider_api_key, provider_app_id")
    .eq("is_active", true)
    // Exclude numbers that should not be picked up by Launch
    .not("status", "in", "(restricted,banned,inactive)");
  let templatesQuery = supabase
    .from("message_templates")
    .select("id, name, language, status, category, body, whatsapp_number_id, workspace_id, variables, buttons, provider_template_id, synced_at, variables_sample, header_text, footer_text, sync_warning")
    .in("status", ["approved", "paused"])
    .limit(500);

  if (workspaceId) {
    numbersQuery = numbersQuery.eq("workspace_id", workspaceId);
    templatesQuery = templatesQuery.eq("workspace_id", workspaceId);
  }

  const [numRes, tplRes] = await Promise.all([numbersQuery, templatesQuery]);
  if (numRes.error) throw numRes.error;
  if (tplRes.error) throw tplRes.error;

  return {
    numbers: (numRes.data ?? []) as WhatsAppNumber[],
    templates: (tplRes.data ?? []) as Template[],
  };
}

export async function fetchCampaignSummaries(workspaceId?: string) {
  let q = supabase
    .from("campaigns")
    .select("id, name, status, total_recipients, sent_count, failed_count, created_at, whatsapp_number_id, template_id, workspace_id, delay_min_seconds, delay_max_seconds, today_recipients_count, first_scheduled_at, recipient_country, scheduled_dates, scheduled_start_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchConversationsLite(workspaceId?: string, limit = 200) {
  let q = supabase
    .from("conversations")
    .select("id, contact_phone, contact_name, last_message_at, whatsapp_number_id")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ---------- Logical templates ----------

const stripVersion = (n: string) =>
  n
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_v\d+$/i, "")
    .replace(/_\d+$/i, "")
    .replace(/_+/g, "_");

export type TemplateGroup = {
  id: string;
  workspace_id: string;
  name: string;
  category: "marketing" | "utility";
  template_names: string[];
};

export async function fetchTemplateGroups(workspaceId: string): Promise<TemplateGroup[]> {
  const { data, error } = await supabase
    .from("template_groups")
    .select("id, workspace_id, name, category, template_names")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TemplateGroup[];
}

const normalizeName = (n: string) => n.toLowerCase().trim().replace(/[\s-]+/g, "_").replace(/_+/g, "_");

export function groupLogicalTemplates(templates: Template[], savedGroups: TemplateGroup[] = []): LogicalTemplate[] {
  const map = new Map<string, LogicalTemplate>();
  // Mark template ids that are claimed by a saved group, so auto-grouping skips them.
  const claimed = new Set<string>();

  // 1. Saved groups take priority — match by normalized name against group.template_names
  for (const g of savedGroups) {
    const wanted = new Set(g.template_names.map(normalizeName));
    const variants = templates.filter((t) => wanted.has(normalizeName(t.name)));
    if (variants.length === 0) continue;
    const entry: LogicalTemplate = {
      key: `group:${g.id}`,
      label: g.name,
      category: g.category as any,
      variables: [],
      body: null,
      variablesSample: [],
      variants: [],
      variantByNumber: new Map(),
    };
    for (const t of variants) {
      claimed.add(t.id);
      entry.variants.push(t);
      if (t.whatsapp_number_id) entry.variantByNumber.set(t.whatsapp_number_id, t);
      const vars = Array.isArray(t.variables) ? (t.variables as string[]) : [];
      for (const v of vars) if (!entry.variables.includes(v)) entry.variables.push(v);
      if (!entry.body && t.body) entry.body = t.body;
      const sample = Array.isArray(t.variables_sample) ? (t.variables_sample as any[]).map((x) => String(x ?? "")) : [];
      if (sample.length > entry.variablesSample.length) entry.variablesSample = sample;
    }
    map.set(entry.key, entry);
  }

  // 2. Auto-group remaining templates by stripped-version name
  for (const t of templates) {
    if (claimed.has(t.id)) continue;
    const key = stripVersion(t.name);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        label: humanizeLabel(key),
        category: (t.category as any) ?? "marketing",
        variables: [],
        body: t.body ?? null,
        variablesSample: [],
        variants: [],
        variantByNumber: new Map(),
      };
      map.set(key, entry);
    }
    entry.variants.push(t);
    if (t.whatsapp_number_id) entry.variantByNumber.set(t.whatsapp_number_id, t);
    const vars = Array.isArray(t.variables) ? (t.variables as string[]) : [];
    for (const v of vars) if (!entry.variables.includes(v)) entry.variables.push(v);
    if (!entry.body && t.body) entry.body = t.body;
    const sample = Array.isArray(t.variables_sample) ? (t.variables_sample as any[]).map((x) => String(x ?? "")) : [];
    if (sample.length > entry.variablesSample.length) entry.variablesSample = sample;
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function humanizeLabel(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------- Rendering ----------
//
// Re-export from the shared edge-function module so the wizard preview, the
// inbox renderer, and the Gupshup send path can never disagree.
// See supabase/functions/_shared/template.ts for the rationale.
export { renderTemplateBody } from "../../supabase/functions/_shared/template";

// ---------- Recipient parsing ----------

export function parseCsv(raw: string): Recipient[] {
  const rows = raw.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (rows.length === 0) return [];
  const first = rows[0].split(",").map((c) => c.trim().toLowerCase());
  const known = ["phone", "contact_phone", "name", "contact_name"];
  const hasHeader = first.some((c) => known.includes(c));
  const headers = hasHeader ? first : ["phone", "name"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows
    .map((row) => {
      const cols = row.split(",").map((c) => c.trim());
      const item: Recipient = { phone: "", variables: {} };
      headers.forEach((h, idx) => {
        const value = cols[idx] ?? "";
        if (h === "phone" || h === "contact_phone") item.phone = value;
        else if (h === "name" || h === "contact_name") item.name = value;
        else if (value) item.variables![h] = value;
      });
      return item;
    })
    .filter((r) => r.phone.replace(/[^\d]/g, "").length >= 8);
}

export function detectColumns(recipients: Recipient[]): string[] {
  const cols = new Set<string>(["phone", "name"]);
  for (const r of recipients.slice(0, 50)) {
    for (const k of Object.keys(r.variables ?? {})) cols.add(k);
  }
  return Array.from(cols);
}

// Apply variable mapping (varName -> column key). Special "__static:value" => literal.
export function applyMapping(
  recipients: Recipient[],
  mapping: Record<string, string>,
  variableNames: string[],
): Recipient[] {
  return recipients.map((r) => {
    const vars: Record<string, string> = { ...(r.variables ?? {}) };
    for (const v of variableNames) {
      const src = mapping[v];
      if (!src) continue;
      if (src.startsWith("__static:")) {
        vars[v] = src.slice("__static:".length);
      } else if (src === "phone") {
        vars[v] = r.phone;
      } else if (src === "name") {
        vars[v] = r.name ?? "";
      } else {
        vars[v] = r.variables?.[src] ?? "";
      }
    }
    return { ...r, variables: vars };
  });
}

// ---------- Naming ----------

const COUNTRY_BY_PREFIX: Array<[string, string]> = [
  ["971", "AE"], ["972", "IL"], ["966", "SA"], ["965", "KW"], ["974", "QA"], ["973", "BH"], ["968", "OM"],
  ["1", "US"], ["44", "UK"], ["49", "DE"], ["33", "FR"], ["34", "ES"], ["39", "IT"], ["31", "NL"], ["351", "PT"],
  ["353", "IE"], ["41", "CH"], ["43", "AT"], ["46", "SE"], ["47", "NO"], ["45", "DK"], ["358", "FI"],
  ["7", "RU"], ["380", "UA"], ["48", "PL"], ["420", "CZ"], ["36", "HU"], ["40", "RO"],
  ["91", "IN"], ["86", "CN"], ["81", "JP"], ["82", "KR"], ["65", "SG"], ["60", "MY"], ["62", "ID"], ["63", "PH"], ["66", "TH"], ["84", "VN"],
  ["61", "AU"], ["64", "NZ"], ["55", "BR"], ["52", "MX"], ["54", "AR"], ["56", "CL"], ["57", "CO"],
  ["27", "ZA"], ["20", "EG"], ["234", "NG"], ["254", "KE"], ["212", "MA"],
];

export function geoFromPhone(phone: string | null | undefined): string {
  if (!phone) return "--";
  const digits = String(phone).replace(/[^\d]/g, "");
  if (!digits) return "--";
  // Try longest prefix match
  const sorted = [...COUNTRY_BY_PREFIX].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, code] of sorted) {
    if (digits.startsWith(prefix)) return code;
  }
  return "--";
}

export type NameInputs = {
  date?: Date;
  geo?: string;
  audience?: string;
  templateLabel?: string;
  cta?: string;
};

export function buildCampaignName(input: NameInputs): string {
  const d = input.date ?? new Date();
  // Always use Dubai (workspace) time so the launch date matches the batch date
  // produced by buildBatchName. Browser-local + UTC mixing caused names like
  // "2026-05-19 | UK | 2026-05-18 | UK | ..." near midnight UTC.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const dateKey = fmt.format(d); // YYYY-MM-DD
  const parts = [
    dateKey,
    input.geo || "--",
    (input.audience || "Audience").trim(),
    (input.templateLabel || "Template").trim(),
    (input.cta || "CTA").trim(),
  ];
  return parts.join(" | ");
}

// ---------- Sender pools ----------

export type SenderPool = {
  country: string; // ISO2 or "--"
  numbers: WhatsAppNumber[];
};

export function groupNumbersByCountry(numbers: WhatsAppNumber[]): SenderPool[] {
  const map = new Map<string, WhatsAppNumber[]>();
  for (const n of numbers) {
    const code = geoFromPhone(n.phone_number);
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(n);
  }
  return Array.from(map.entries())
    .map(([country, list]) => ({ country, numbers: list }))
    .sort((a, b) => b.numbers.length - a.numbers.length);
}


// ---------- Mapping persistence (localStorage) ----------

const mappingKey = (workspaceId: string, logicalKey: string) => `iskra:mapping:${workspaceId}:${logicalKey}`;

export function loadMapping(workspaceId: string, logicalKey: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(mappingKey(workspaceId, logicalKey));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveMapping(workspaceId: string, logicalKey: string, mapping: Record<string, string>) {
  try {
    localStorage.setItem(mappingKey(workspaceId, logicalKey), JSON.stringify(mapping));
  } catch {
    // ignore
  }
}

// ---------- Saved audiences (localStorage) ----------

const audienceKey = (workspaceId: string) => `iskra:audiences:${workspaceId}`;

export type SavedAudience = { id: string; name: string; csv: string; created_at: string; count: number };

export function listSavedAudiences(workspaceId: string): SavedAudience[] {
  try {
    const raw = localStorage.getItem(audienceKey(workspaceId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAudience(workspaceId: string, name: string, csv: string, count: number): SavedAudience {
  const list = listSavedAudiences(workspaceId);
  const item: SavedAudience = {
    id: crypto.randomUUID(),
    name: name.trim() || `Audience ${list.length + 1}`,
    csv,
    created_at: new Date().toISOString(),
    count,
  };
  list.unshift(item);
  try {
    localStorage.setItem(audienceKey(workspaceId), JSON.stringify(list.slice(0, 20)));
  } catch {
    // ignore
  }
  return item;
}

export function deleteSavedAudience(workspaceId: string, id: string) {
  const list = listSavedAudiences(workspaceId).filter((x) => x.id !== id);
  try {
    localStorage.setItem(audienceKey(workspaceId), JSON.stringify(list));
  } catch {
    // ignore
  }
}
