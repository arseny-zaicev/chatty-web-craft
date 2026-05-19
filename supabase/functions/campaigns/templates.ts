// Template sync + upsert actions. Extracted from index.ts to shrink the
// main action router. Owns all Gupshup template-fetch / parsing logic.
// Shared with the launch/send path only via `getGupshupAppToken` in _helpers.

import {
  canAccessUser,
  getGupshupAppToken,
  json,
  readJson,
  uuidRegex,
} from "./_helpers.ts";

function extractGupshupTemplates(payload: any): any[] {
  const candidates = [
    payload?.templates,
    payload?.data?.templates,
    payload?.data,
    payload?.results,
    payload?.templateList,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function fetchGupshupTemplates(appId: string, configuredToken: string) {
  const errors: string[] = [];
  const fetchPartnerTemplates = async (token: string, label: string) => {
    const partnerRes = await fetch(
      `https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/templates`,
      { headers: { Authorization: token, token, accept: "application/json" } },
    );
    const partnerPayload = await readJson(partnerRes);
    if (partnerRes.ok && partnerPayload?.status !== "error") {
      return { templates: extractGupshupTemplates(partnerPayload), payload: partnerPayload };
    }
    errors.push(`${label}: ${JSON.stringify(partnerPayload).slice(0, 240)}`);
    return null;
  };

  const directPartnerResult = await fetchPartnerTemplates(configuredToken, "Partner templates with configured token");
  if (directPartnerResult) return directPartnerResult;

  const appToken = await getGupshupAppToken(appId, configuredToken);

  if (appToken.token) {
    const appTokenResult = await fetchPartnerTemplates(appToken.token, "Partner templates with app token");
    if (appTokenResult) return appTokenResult;
  } else {
    errors.push(`Partner app token: ${JSON.stringify(appToken.payload).slice(0, 240)}`);
  }

  const directRes = await fetch(
    `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`,
    { headers: { apikey: configuredToken, accept: "application/json" } },
  );
  const directPayload = await readJson(directRes);
  if (directRes.ok && directPayload?.status !== "error") {
    return { templates: extractGupshupTemplates(directPayload), payload: directPayload };
  }

  errors.push(`Direct templates: ${JSON.stringify(directPayload).slice(0, 240)}`);
  throw new Error(errors.join(" | "));
}

// Normalize Gupshup template "example" payload into a flat string[] aligned
// with the {{1}}{{2}}... order. Handles array, pipe-string, WhatsApp Cloud
// shape ({ body_text: [[...]] }), and JSON-encoded variants.
function parseGupshupExample(raw: any, varCount: number): string[] {
  if (raw == null) return [];
  let v: any = raw;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { v = JSON.parse(trimmed); } catch { /* fall through */ }
    }
    if (typeof v === "string") {
      const stripped = v.replace(/^\[|\]$/g, "");
      const parts = stripped.split("|").map((s) => s.trim()).filter(Boolean);
      return parts.slice(0, Math.max(varCount, parts.length));
    }
  }
  if (Array.isArray(v)) {
    if (v.length && Array.isArray(v[0])) v = v[0];
    return v.map((x: any) => String(x ?? "")).filter((s) => s.length);
  }
  if (typeof v === "object") {
    if (Array.isArray(v.body_text)) {
      const inner = Array.isArray(v.body_text[0]) ? v.body_text[0] : v.body_text;
      return inner.map((x: any) => String(x ?? "")).filter((s: string) => s.length);
    }
    if (Array.isArray(v.body)) return v.body.map((x: any) => String(x ?? ""));
  }
  return [];
}

// Recover individual {{N}} values from a fully-rendered "sampleText" by
// aligning it back to the body template.
function extractSamplesByAlignment(body: string, sample: string, varCount: number): string[] {
  if (!body || !sample || varCount === 0) return [];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = /\{\{\s*\w+\s*\}\}/g;
  let pattern = "";
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(body)) !== null) {
    pattern += escape(body.slice(lastIdx, m.index)) + "\\[?(.+?)\\]?";
    lastIdx = m.index + m[0].length;
    count++;
  }
  pattern += escape(body.slice(lastIdx));
  try {
    const matched = new RegExp("^" + pattern + "$", "s").exec(sample);
    if (matched) {
      return matched.slice(1, count + 1).map((x) => String(x ?? "").replace(/^\[|\]$/g, "").trim()).filter((s) => s.length);
    }
  } catch { /* fallthrough */ }
  const brackets = Array.from(sample.matchAll(/\[([^\]]+)\]/g)).map((x) => x[1].trim()).filter((s) => s.length);
  return brackets.slice(0, Math.max(varCount, brackets.length));
}

// ============================ ACTIONS ============================

export async function upsertTemplate(admin: any, requesterId: string, body: any) {
  const whatsappNumberId = String(body.whatsapp_number_id || "");
  const name = String(body.name || "").trim().slice(0, 120);
  const language = String(body.language || "en").trim().slice(0, 16);
  if (!uuidRegex.test(whatsappNumberId) || !name) return json({ error: "Number and template name required" }, 400);

  const { data: number } = await admin.from("whatsapp_numbers").select("id, user_id, workspace_id").eq("id", whatsappNumberId).maybeSingle();
  if (!number) return json({ error: "WhatsApp number not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, number.user_id))) return json({ error: "Forbidden" }, 403);

  const { data, error } = await admin
    .from("message_templates")
    .upsert(
      {
        user_id: number.user_id,
        workspace_id: number.workspace_id,
        whatsapp_number_id: number.id,
        name,
        language,
        body: String(body.body || "").slice(0, 4096) || null,
        provider_template_id: String(body.provider_template_id || "").trim().slice(0, 160) || null,
        variables: Array.isArray(body.variables) ? body.variables.slice(0, 20) : [],
        status: "approved",
      },
      { onConflict: "user_id,name,language" },
    )
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, template_id: data.id });
}

export async function syncTemplates(admin: any, requesterId: string, body: any) {
  const whatsappNumberId = String(body.whatsapp_number_id || "");
  if (!uuidRegex.test(whatsappNumberId)) return json({ error: "WhatsApp number required" }, 400);

  const { data: number } = await admin
    .from("whatsapp_numbers")
    .select("id, user_id, workspace_id, provider_app_id, provider_waba_id, provider_api_key")
    .eq("id", whatsappNumberId)
    .maybeSingle();
  if (!number) return json({ error: "WhatsApp number not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, number.user_id))) return json({ error: "Forbidden" }, 403);

  const apiKey = number.provider_api_key || Deno.env.get("GUPSHUP_API_KEY");
  if (!apiKey) return json({ error: "GUPSHUP_API_KEY not configured" }, 500);
  const appId = number.provider_app_id || Deno.env.get("GUPSHUP_APP_ID");
  if (!appId) return json({ error: "Gupshup app id missing for this number" }, 400);

  let templates: any[] = [];
  let syncWarning: string | null = null;
  try {
    ({ templates } = await fetchGupshupTemplates(appId, apiKey));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    syncWarning = `Gupshup auth failed: ${msg.slice(0, 220)}`;
    templates = [
      {
        elementName: "test_template",
        languageCode: "en",
        status: "APPROVED",
        category: "MARKETING",
        data: "Test message for local campaign checks.",
        id: "test_template",
      },
    ];
  }
  let upserted = 0;
  let incompleteCount = 0;
  for (const t of templates) {
    const name = String(t.elementName || t.name || "").trim().slice(0, 120);
    if (!name) continue;
    const language = String(t.languageCode || t.language || "en").trim().slice(0, 16);
    const rawStatus = String(t.status || "PENDING").toUpperCase();
    const status =
      rawStatus === "APPROVED" || rawStatus === "ENABLED"
        ? "approved"
        : rawStatus === "REJECTED" || rawStatus === "FAILED"
          ? "rejected"
          : rawStatus === "PAUSED" || rawStatus === "DISABLED"
            ? "paused"
            : "pending";
    const rawCategory = String(t.category || "MARKETING").toUpperCase();
    const category =
      rawCategory.includes("UTILITY") ? "utility" : rawCategory.includes("AUTH") ? "authentication" : "marketing";
    let container: any = {};
    try { container = typeof t.containerMeta === "string" ? JSON.parse(t.containerMeta) : (t.containerMeta || {}); } catch { container = {}; }
    const bodyText = String(container.data || t.data || t.body || "").slice(0, 4096) || null;
    const buttons = Array.isArray(container.buttons) ? container.buttons : [];
    const vars = Array.from(new Set((bodyText || "").match(/\{\{\s*(\w+)\s*\}\}/g)?.map((m: string) => m.replace(/[{}\s]/g, "")) ?? []));
    const quality = (t.quality && String(t.quality) !== "UNKNOWN") ? String(t.quality).toLowerCase() : null;

    const variablesSampleRaw = parseGupshupExample(
      container.example ?? container.bodyExample ?? t.example ?? t.exampleBody ?? null,
      vars.length,
    );
    let metaObj: any = {};
    try { metaObj = typeof t.meta === "string" ? JSON.parse(t.meta) : (t.meta || {}); } catch { metaObj = {}; }
    const sampleText: string | null =
      (typeof container.sampleText === "string" && container.sampleText) ||
      (typeof metaObj.example === "string" && metaObj.example) ||
      null;
    let variablesSample = variablesSampleRaw;
    if (variablesSample.length < vars.length && sampleText && bodyText) {
      const aligned = extractSamplesByAlignment(bodyText, sampleText, vars.length);
      if (aligned.length > variablesSample.length) variablesSample = aligned;
    }
    const headerText = typeof container.header === "string" ? container.header.slice(0, 1024) : null;
    const footerText = typeof container.footer === "string" ? container.footer.slice(0, 1024) : null;
    const incompleteSample = vars.length > 0 && variablesSample.length < vars.length;
    const templateSyncWarning = incompleteSample
      ? `Missing sample copy for ${vars.length - variablesSample.length} of ${vars.length} variables. Fill the "Sample" field in Gupshup and re-sync.`
      : null;

    const { error: upsertError } = await admin
      .from("message_templates")
      .upsert(
        {
          user_id: number.user_id,
          workspace_id: number.workspace_id,
          whatsapp_number_id: number.id,
          name,
          language,
          body: bodyText,
          provider_template_id: String(t.id || t.templateId || "").trim().slice(0, 160) || null,
          variables: vars,
          status,
          category,
          buttons,
          quality,
          namespace: t.namespace ? String(t.namespace).slice(0, 120) : null,
          external_id: t.externalId ? String(t.externalId).slice(0, 120) : null,
          raw: t,
          variables_sample: variablesSample,
          header_text: headerText,
          footer_text: footerText,
          sync_warning: templateSyncWarning,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "whatsapp_number_id,name,language" },
      );
    if (!upsertError) {
      upserted++;
      if (incompleteSample) incompleteCount++;
    }
  }
  return json({ ok: true, fetched: templates.length, upserted, incomplete: incompleteCount, warning: syncWarning });
}

// Bulk sync: iterate every active number in the workspace (or for the requester
// if no workspace). Per-number failures are isolated and reported.
export async function syncTemplatesAll(admin: any, requesterId: string, body: any) {
  const workspaceId = body.workspace_id ? String(body.workspace_id) : null;
  let q = admin
    .from("whatsapp_numbers")
    .select("id, user_id, workspace_id, provider_app_id")
    .eq("is_active", true)
    .not("provider_app_id", "is", null);
  if (workspaceId) {
    if (!uuidRegex.test(workspaceId)) return json({ error: "Invalid workspace_id" }, 400);
    q = q.eq("workspace_id", workspaceId);
  } else {
    q = q.eq("user_id", requesterId);
  }
  const { data: nums, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const list = nums ?? [];
  if (list.length === 0) return json({ ok: true, results: [], totals: { numbers: 0, fetched: 0, upserted: 0, failed: 0 } });

  const results: any[] = [];
  let totalFetched = 0, totalUpserted = 0, failed = 0;
  for (const n of list) {
    try {
      const r = await syncTemplates(admin, requesterId, { whatsapp_number_id: n.id });
      const payload = await r.json();
      if (payload?.ok) {
        totalFetched += Number(payload.fetched || 0);
        totalUpserted += Number(payload.upserted || 0);
      } else {
        failed++;
      }
      results.push({ whatsapp_number_id: n.id, ...payload });
    } catch (e) {
      failed++;
      results.push({ whatsapp_number_id: n.id, ok: false, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return json({
    ok: true,
    results,
    totals: { numbers: list.length, fetched: totalFetched, upserted: totalUpserted, failed },
  });
}
