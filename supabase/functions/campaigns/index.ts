import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acquireJobLock } from "../_shared/jobLock.ts";
import {
  buildTemplateParams,
  renderTemplateBody as sharedRenderTemplateBody,
  validateTemplateForLaunch,
} from "../_shared/template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strips a phone string to digits only. Recipients reaching this point have
// already been normalized + CC-repaired upstream by `lead-intake` /
// `google-sheets-sync` (which both use `_shared/phone.ts`). This helper only
// guarantees a clean digits-only contact_phone for inserts into
// campaign_recipients / conversations. Do NOT use this for raw lead intake.
function stripToDigits(phone: string) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function randomDelay(min: number, max: number) {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function readJson(res: Response) {
  return await res.json().catch(() => ({}));
}

function extractGupshupTemplates(payload: any): any[] {
  const candidates = [payload?.templates, payload?.data?.templates, payload?.data, payload?.results, payload?.templateList];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

async function getGupshupAppToken(appId: string, partnerToken: string) {
  const attempts = [
    { Authorization: partnerToken, accept: "application/json" },
    { token: partnerToken, accept: "application/json" },
  ];
  let lastPayload: any = {};
  for (const headers of attempts) {
    const res = await fetch(`https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/token/`, { headers });
    const payload = await readJson(res);
    const token = typeof payload?.token?.token === "string" ? payload.token.token : typeof payload?.token === "string" ? payload.token : "";
    if (res.ok && token) return { token, payload };
    lastPayload = payload;
  }
  return { token: "", payload: lastPayload };
}

async function fetchGupshupTemplates(appId: string, configuredToken: string) {
  const errors: string[] = [];
  const fetchPartnerTemplates = async (token: string, label: string) => {
    const partnerRes = await fetch(`https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/templates`, {
      headers: { Authorization: token, token, accept: "application/json" },
    });
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

  const directRes = await fetch(`https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`, {
    headers: { apikey: configuredToken, accept: "application/json" },
  });
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
      // pipe-separated like "[John|funding|Score…]" or "John|funding|Score"
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

// Gupshup also exposes samples as a fully-rendered "sampleText" where each
// {{N}} placeholder has been replaced with [value]. We align it back to the
// body template to recover individual variable values in order.
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
  // Fallback: just pull values in [...] in order.
  const brackets = Array.from(sample.matchAll(/\[([^\]]+)\]/g)).map((x) => x[1].trim()).filter((s) => s.length);
  return brackets.slice(0, Math.max(varCount, brackets.length));
}

async function resolveGupshupSendToken(appId: string | null | undefined, configuredToken: string) {
  if (!appId) return configuredToken;
  const appToken = await getGupshupAppToken(appId, configuredToken);
  return appToken.token || configuredToken;
}

async function getUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, authHeader };
}

async function canAccessUser(admin: any, requesterId: string, ownerId: string) {
  if (requesterId === ownerId) return true;
  const { data } = await admin.rpc("is_admin", { _user_id: requesterId });
  return Boolean(data);
}

// Map common phone country prefixes -> IANA timezone (rough, single TZ per country)
const PHONE_TZ: Array<[string, string]> = [
  ["971", "Asia/Dubai"], ["972", "Asia/Jerusalem"], ["966", "Asia/Riyadh"], ["965", "Asia/Kuwait"],
  ["974", "Asia/Qatar"], ["973", "Asia/Bahrain"], ["968", "Asia/Muscat"], ["20", "Africa/Cairo"],
  ["44", "Europe/London"], ["353", "Europe/Dublin"], ["33", "Europe/Paris"], ["49", "Europe/Berlin"],
  ["34", "Europe/Madrid"], ["39", "Europe/Rome"], ["31", "Europe/Amsterdam"], ["351", "Europe/Lisbon"],
  ["41", "Europe/Zurich"], ["43", "Europe/Vienna"], ["46", "Europe/Stockholm"], ["47", "Europe/Oslo"],
  ["45", "Europe/Copenhagen"], ["358", "Europe/Helsinki"], ["48", "Europe/Warsaw"], ["420", "Europe/Prague"],
  ["7", "Europe/Moscow"], ["380", "Europe/Kyiv"],
  ["1", "America/New_York"], ["52", "America/Mexico_City"], ["55", "America/Sao_Paulo"], ["54", "America/Argentina/Buenos_Aires"],
  ["91", "Asia/Kolkata"], ["86", "Asia/Shanghai"], ["81", "Asia/Tokyo"], ["82", "Asia/Seoul"],
  ["65", "Asia/Singapore"], ["60", "Asia/Kuala_Lumpur"], ["62", "Asia/Jakarta"], ["63", "Asia/Manila"],
  ["66", "Asia/Bangkok"], ["84", "Asia/Ho_Chi_Minh"], ["61", "Australia/Sydney"], ["64", "Pacific/Auckland"],
  ["27", "Africa/Johannesburg"], ["234", "Africa/Lagos"], ["254", "Africa/Nairobi"], ["212", "Africa/Casablanca"],
];

// ISO country code -> primary IANA TZ (mirrors campaign-day-rollover.COUNTRY_TZ)
const COUNTRY_TZ: Record<string, string> = {
  US: "America/New_York", CA: "America/Toronto", GB: "Europe/London", UK: "Europe/London",
  AE: "Asia/Dubai", SA: "Asia/Riyadh", IN: "Asia/Kolkata", DE: "Europe/Berlin",
  FR: "Europe/Paris", IT: "Europe/Rome", ES: "Europe/Madrid", NL: "Europe/Amsterdam",
  BR: "America/Sao_Paulo", MX: "America/Mexico_City", AU: "Australia/Sydney",
  JP: "Asia/Tokyo", SG: "Asia/Singapore", HK: "Asia/Hong_Kong",
};

function tzFromPhone(phone: string): string {
  const d = String(phone || "").replace(/[^\d]/g, "");
  if (!d) return "UTC";
  const sorted = [...PHONE_TZ].sort((a, b) => b[0].length - a[0].length);
  for (const [pfx, tz] of sorted) if (d.startsWith(pfx)) return tz;
  return "UTC";
}

// Get UTC offset (minutes) for a given IANA tz at instant `at`. Approximate, good enough for windows.
function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const parts = dtf.formatToParts(at);
    const map: any = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch { return 0; }
}

// Parse "HH:MM" to minutes
function hhmmToMin(s: string): number {
  const [h, m] = String(s || "09:00").split(":").map((x) => parseInt(x, 10) || 0);
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m));
}

// Build a UTC Date for `dateStr (YYYY-MM-DD) at HH:MM in tz`.
function dateAtTzToUTC(dateStr: string, hhmm: string, tz: string): Date {
  const [Y, M, D] = dateStr.split("-").map((x) => parseInt(x, 10));
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
  // Treat the wall clock as UTC, then offset
  const naiveUtc = Date.UTC(Y, (M || 1) - 1, D || 1, h || 0, m || 0, 0);
  const offset = tzOffsetMinutes(tz, new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60_000);
}

// Poisson inter-arrival sampler with given rate (events per second). Returns seconds gap.
function exponentialGap(ratePerSec: number): number {
  if (ratePerSec <= 0) return 0;
  const u = Math.max(1e-9, Math.random());
  return -Math.log(u) / ratePerSec;
}

async function notifyLaunchSlack(workspace_id: string | null, payload: { name: string; recipients: number; firstAt: string; mode: string; numberPhone?: string }) {
  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const slackKey = Deno.env.get("SLACK_API_KEY");
    if (!lovableKey || !slackKey) return;
    // Look up channel from workspace, fallback to default
    let channel = "#delivery-campaigns";
    if (workspace_id) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: ws } = await admin.from("workspaces").select("slack_channel_id, name").eq("id", workspace_id).maybeSingle();
        if (ws?.slack_channel_id) channel = ws.slack_channel_id;
      } catch { /* ignore */ }
    }
    const text = `🚀 *Campaign launched*: ${payload.name}\n• Recipients: *${payload.recipients}*\n• First send: ${payload.firstAt}\n• Scheduler: ${payload.mode}${payload.numberPhone ? `\n• Number: +${payload.numberPhone}` : ""}`;
    await fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": slackKey, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        channel,
        text,
        username: "Iskra",
        icon_url: "https://iskra.ae/iskra-favicon-v2.png",
        unfurl_links: false,
        unfurl_media: false,
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
}

async function launchCampaign(admin: any, requesterId: string, body: any) {
  const name = String(body.name || "").trim().slice(0, 160);
  const minDelay = Math.max(0, Math.min(86400, Number(body.delay_min_seconds ?? 30)));
  const maxDelay = Math.max(minDelay, Math.min(86400, Number(body.delay_max_seconds ?? 90)));
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  // Per-number/day cap. Hard ceiling 200 (Meta tier), floor 1.
  const perNumberQuota = Math.max(1, Math.min(200, Math.floor(Number(body.per_number_quota ?? 200))));

  // Multi-number support: accept either legacy single (whatsapp_number_id+template_id)
  // or new `numbers: [{number_id, template_id}, ...]`. ONE campaign row is created
  // and recipients are round-robin distributed across the numbers; each recipient
  // row stores its assigned whatsapp_number_id (and template id under variables.__tpl_id).
  const rawNumbers: Array<{ number_id: string; template_id: string }> = Array.isArray(body.numbers) && body.numbers.length > 0
    ? body.numbers
        .map((n: any) => ({
          number_id: String(n?.number_id || n?.numberId || ""),
          template_id: String(n?.template_id || n?.templateId || ""),
        }))
        .filter((n: any) => uuidRegex.test(n.number_id) && uuidRegex.test(n.template_id))
    : (uuidRegex.test(String(body.whatsapp_number_id || "")) && uuidRegex.test(String(body.template_id || ""))
        ? [{ number_id: String(body.whatsapp_number_id), template_id: String(body.template_id) }]
        : []);

  // New scheduling params
  const schedulerKind: "uniform" | "poisson" = body.scheduler_kind === "uniform" ? "uniform" : "poisson";
  const scheduledDates: string[] = Array.isArray(body.scheduled_dates) ? body.scheduled_dates.filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  const windowStart: string = typeof body.window_start === "string" && /^\d{2}:\d{2}$/.test(body.window_start) ? body.window_start : "09:00";
  const windowEnd: string = typeof body.window_end === "string" && /^\d{2}:\d{2}$/.test(body.window_end) ? body.window_end : "18:00";
  const dispatchMode: "paced" | "marketing_instant" =
    body.dispatch_mode === "marketing_instant" ? "marketing_instant" : "paced";
  // marketing_instant implies blast scheduling regardless of incoming delays.
  const isBlastLaunch = dispatchMode === "marketing_instant" || (minDelay === 0 && maxDelay === 0);
  const maxInflightPerNumber = Math.max(1, Math.min(500, Math.floor(Number(body.max_inflight_per_number ?? 5))));
  const maxInflightPerCampaign = Math.max(1, Math.min(5000, Math.floor(Number(body.max_inflight_per_campaign ?? 50))));
  const respectTz: boolean = body.respect_recipient_tz !== false;
  const pipelineId: string | null = typeof body.pipeline_id === "string" && uuidRegex.test(body.pipeline_id) ? body.pipeline_id : null;

  // Snapshot enforcement: if a prepared snapshot exists for this campaign id, validate freshness.
  // Standalone launch (no campaign_id) goes through fresh allocation below.
  const reuseCampaignId: string | null =
    typeof body.campaign_id === "string" && uuidRegex.test(body.campaign_id) ? body.campaign_id : null;
  if (reuseCampaignId) {
    const { data: existing } = await admin
      .from("campaigns")
      .select("prepared_at, prepared_expires_at, prepared_signature, kill_switch_at, dispatch_mode")
      .eq("id", reuseCampaignId)
      .maybeSingle();
    if (existing) {
      if (existing.kill_switch_at) {
        return json({ error: "Kill switch is engaged for this campaign", code: "kill_switch_on" }, 409);
      }
      if (!existing.prepared_at || !existing.prepared_expires_at) {
        return json({ error: "Snapshot not prepared. Call action=prepare first.", code: "must_prepare" }, 409);
      }
      if (new Date(existing.prepared_expires_at).getTime() < Date.now()) {
        return json({ error: "Prepared snapshot expired. Re-prepare.", code: "stale_snapshot", must_reprepare: true }, 409);
      }
    }
  }
  // Global instant kill switch.
  if (dispatchMode === "marketing_instant") {
    const { data: flag } = await admin.from("system_flags").select("value").eq("key", "marketing_instant_enabled").maybeSingle();
    if (flag && flag.value === false) {
      return json({ error: "Marketing instant mode is globally disabled", code: "instant_mode_disabled" }, 409);
    }
    // marketing_instant requires a prepared snapshot. Fresh launches (no
    // reuseCampaignId) cannot run instantly — they must go through prepare
    // first so the operator sees blockers/warnings and the snapshot signature
    // is locked. (Paced mode is unchanged.)
    if (!reuseCampaignId) {
      return json({
        error: "marketing_instant requires a prepared campaign. Call action=prepare first, then action=launch with the campaign_id.",
        code: "must_prepare",
      }, 409);
    }
  }

  if (!name || rawNumbers.length === 0) {
    return json({ error: "Campaign name and at least one number+template are required" }, 400);
  }
  if (recipients.length < 1 || recipients.length > 50000) {
    return json({ error: "Add 1-50000 recipients" }, 400);
  }

  const numberIds = [...new Set(rawNumbers.map((n) => n.number_id))];
  const { data: numberRows } = await admin
    .from("whatsapp_numbers")
    .select("id, user_id, workspace_id, phone_number, provider_app_id, country_code, daily_send_limit")
    .in("id", numberIds);
  if (!numberRows || numberRows.length !== numberIds.length) return json({ error: "WhatsApp number not found" }, 404);
  const ownerId = numberRows[0].user_id;
  const wsId = numberRows[0].workspace_id;
  for (const n of numberRows) {
    if (n.user_id !== ownerId || n.workspace_id !== wsId) {
      return json({ error: "All numbers must belong to the same workspace" }, 400);
    }
  }
  if (!(await canAccessUser(admin, requesterId, ownerId))) return json({ error: "Forbidden" }, 403);

  const templateIds = [...new Set(rawNumbers.map((n) => n.template_id))];
  const { data: templateRows } = await admin
    .from("message_templates")
    .select("id, user_id, name, language, variables, provider_template_id, body")
    .in("id", templateIds);
  if (!templateRows || templateRows.length !== templateIds.length) return json({ error: "Template not found" }, 404);
  for (const t of templateRows) {
    if (t.user_id !== ownerId) return json({ error: "Template not found" }, 404);
  }

  // Primary number/template = first entry (for legacy campaigns.whatsapp_number_id / template_id)
  const primary = rawNumbers[0];
  const number = numberRows.find((n: any) => n.id === primary.number_id)!;
  const template = templateRows.find((t: any) => t.id === primary.template_id)!;
  const bucketIndex = 0;
  const bucketCount = rawNumbers.length;
  const whatsappNumberId = number.id;
  const templateId = template.id;

  const cleanRecipientsAll = recipients
    .map((r: any) => ({
      contact_phone: normalizePhone(r.phone || r.contact_phone),
      contact_name: String(r.name || r.contact_name || "").trim().slice(0, 160) || null,
      variables: typeof r.variables === "object" && r.variables ? r.variables : {},
      conversation_id: typeof r.conversation_id === "string" && uuidRegex.test(r.conversation_id) ? r.conversation_id : null,
    }))
    .filter((r: any) => r.contact_phone.length >= 8 && r.contact_phone.length <= 18);

  if (cleanRecipientsAll.length === 0) return json({ error: "No valid phone numbers" }, 400);

  // ============= CAPACITY-BOUND ALLOCATION (hard truncation) =============
  // capacity = Σ(min(per_number_quota, whatsapp_numbers.daily_send_limit, windowFitCap)) × selected days.
  // Anything beyond capacity is NOT inserted into campaign_recipients and stays
  // free in the audience pool. No silent "send later", no future-day bucket.
  const _wsMinPre = hhmmToMin(windowStart);
  const _wsMaxPre = hhmmToMin(windowEnd);
  const _windowSecondsPre = Math.max(60, (_wsMaxPre - _wsMinPre) * 60);
  const _minGapPre = isBlastLaunch ? 1 : Math.max(60, minDelay || 60);
  const _windowFitCapPre = isBlastLaunch ? perNumberQuota : Math.max(1, Math.floor(_windowSecondsPre / _minGapPre));
  const perNumberCaps = new Map<string, number>();
  // Pre-fetch sent_today per number (Dubai TZ) so the launch knows real remaining
  // headroom and refuses to silently push the rest to tomorrow.
  const dubaiTodayStartIso = (() => {
    const dubaiKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
    return new Date(`${dubaiKey}T00:00:00+04:00`).toISOString();
  })();
  const sentTodayByNumber = new Map<string, number>();
  for (const nid of numberIds) {
    const { count } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_number_id", nid)
      .gte("sent_at", dubaiTodayStartIso);
    sentTodayByNumber.set(nid, count ?? 0);
  }
  let capacityPerDay = 0;
  let capacityToday = 0;
  const capWarnings: string[] = [];
  for (const nid of numberIds) {
    const nrow: any = numberRows.find((n: any) => n.id === nid);
    const dailyLimit = Math.max(1, Math.min(100000, Number(nrow?.daily_send_limit ?? 200)));
    const cap = Math.max(1, Math.min(perNumberQuota, dailyLimit, _windowFitCapPre));
    perNumberCaps.set(nid, cap);
    capacityPerDay += cap;
    const sentToday = sentTodayByNumber.get(nid) ?? 0;
    const remainingToday = Math.max(0, dailyLimit - sentToday);
    capacityToday += Math.min(cap, remainingToday);
    if (sentToday >= dailyLimit) {
      capWarnings.push(`Number ${nrow?.phone_number || nid} already sent ${sentToday}/${dailyLimit} today — new recipients on this number would be deferred to tomorrow.`);
    } else if (sentToday > 0 && cap > remainingToday) {
      capWarnings.push(`Number ${nrow?.phone_number || nid} has ${remainingToday}/${dailyLimit} headroom today (already sent ${sentToday}); excess will spill to next day.`);
    }
  }
  const daysCount = Math.max(1, scheduledDates.length || 1);
  const allocatedCapacity = capacityPerDay * daysCount;
  const audienceTotalRequested = cleanRecipientsAll.length;
  const cleanRecipients = cleanRecipientsAll.slice(0, allocatedCapacity);
  const truncatedCount = audienceTotalRequested - cleanRecipients.length;

  // Single-day launch crossing today's remaining quota? Block unless force=true.
  if (scheduledDates.length <= 1 && capWarnings.length > 0 && cleanRecipients.length > capacityToday && body.force !== true) {
    return json({
      error: "Daily cap would defer recipients to tomorrow",
      code: "would_defer_to_next_day",
      warnings: capWarnings,
      capacity_today: capacityToday,
      requested_today: cleanRecipients.length,
    }, 409);
  }

  // Capacity-truncation guard: if the requested audience exceeds what the
  // selected numbers × days × per-number-cap can deliver, refuse the launch
  // unless explicitly forced. Without this, the silent slice(0, allocatedCapacity)
  // drops thousands of recipients and the operator only finds out later.
  if (truncatedCount > 0 && body.force !== true) {
    return json({
      error: "Audience exceeds capacity for the selected numbers and dates",
      code: "audience_exceeds_capacity",
      requested: audienceTotalRequested,
      capacity: allocatedCapacity,
      truncated: truncatedCount,
      numbers: numberIds.length,
      days: daysCount,
      per_number_quota: perNumberQuota,
      hint: `Add ${Math.ceil(truncatedCount / Math.max(1, perNumberQuota))} more day(s), or add more numbers, or split the audience.`,
    }, 409);
  }

  if (cleanRecipients.length === 0) return json({ error: "Capacity is zero" }, 400);


  // Pre-flight: validate every template that will be used against its actual
  // recipient slice. This is the guard that would have caught the Nov 2025
  // 599/600 #131008 outage at launch instead of after the fact.
  // Caller can pass `force: true` to bypass soft warnings (not hard errors).
  const force = body.force === true;
  const allWarnings: string[] = [];
  try {
    for (const n of rawNumbers) {
      const tpl = templateRows.find((t: any) => t.id === n.template_id);
      if (!tpl) continue;
      // Recipients that will be routed to this template (round-robin slice).
      const idx = rawNumbers.findIndex((x) => x.number_id === n.number_id);
      const sliceForTpl = cleanRecipients.filter(
        (_: any, i: number) => i % rawNumbers.length === idx,
      );
      const { warnings } = validateTemplateForLaunch(
        { name: tpl.name, body: (tpl as any).body ?? null, variables: tpl.variables },
        sliceForTpl,
      );
      allWarnings.push(...warnings);
    }
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "Template validation failed",
      code: "preflight_failed",
    }, 400);
  }
  if (allWarnings.length > 0 && !force) {
    return json({
      error: "Launch needs confirmation",
      code: "preflight_warnings",
      warnings: allWarnings,
    }, 409);
  }


  const recipientCountry = ((number as any).country_code as string | null | undefined)?.toUpperCase() || null;

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .insert({
      user_id: number.user_id,
      workspace_id: number.workspace_id,
      whatsapp_number_id: number.id,
      template_id: template.id,
      name,
      // Insert as draft so the Slack trigger doesn't fire before we know
      // first_scheduled_at / today_recipients_count. We promote to
      // scheduled or running below in a single UPDATE.
      status: "draft",
      delay_min_seconds: minDelay,
      delay_max_seconds: maxDelay,
      total_recipients: cleanRecipients.length,
      scheduled_start_at: new Date().toISOString(),
      schedule_window_start: windowStart + ":00",
      schedule_window_end: (isBlastLaunch ? windowStart : windowEnd) + ":00",
      respect_recipient_tz: respectTz,
      scheduled_dates: scheduledDates,
      pipeline_id: pipelineId,
      recipient_country: recipientCountry,
      per_number_quota: perNumberQuota,
      allocated_capacity: allocatedCapacity,
      audience_total: audienceTotalRequested,
      dispatch_mode: dispatchMode,
      max_inflight_per_number: maxInflightPerNumber,
      max_inflight_per_campaign: maxInflightPerCampaign,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) return json({ error: campaignError?.message || "Failed to create campaign" }, 500);

  // ------- Distribute recipients across numbers (capacity-aware round-robin) -------
  // Each number's bucket is capped at perNumberCaps[number] × daysCount so we
  // never assign more than that number can physically deliver.
  type CleanRecipient = (typeof cleanRecipients)[number];
  const assignments = new Map<string, { template_id: string; list: CleanRecipient[] }>();
  rawNumbers.forEach((n) => assignments.set(n.number_id, { template_id: n.template_id, list: [] }));
  const bucketLimit = new Map<string, number>();
  for (const n of rawNumbers) {
    bucketLimit.set(n.number_id, (perNumberCaps.get(n.number_id) ?? perNumberQuota) * daysCount);
  }
  let rrCursor = 0;
  for (const r of cleanRecipients) {
    let placed = false;
    for (let attempt = 0; attempt < rawNumbers.length; attempt++) {
      const target = rawNumbers[(rrCursor + attempt) % rawNumbers.length];
      const bucket = assignments.get(target.number_id)!;
      if (bucket.list.length < (bucketLimit.get(target.number_id) ?? 0)) {
        bucket.list.push(r);
        rrCursor = (rrCursor + attempt + 1) % rawNumbers.length;
        placed = true;
        break;
      }
    }
    if (!placed) break; // all buckets full — should not happen given capacity truncation
  }

  // ------- Compute scheduled_at per recipient (per-number bucket) -------
  const wsMin = hhmmToMin(windowStart);
  const wsMax = hhmmToMin(windowEnd);
  const windowSeconds = Math.max(60, (wsMax - wsMin) * 60);
  const avgDelay = Math.max(1, (minDelay + maxDelay) / 2);
  const minGapSec = Math.max(60, minDelay || 60);


  const nextDateStr = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };
  const todayKeyTz = (tz: string) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };

  const rows: any[] = [];

  for (let bi = 0; bi < rawNumbers.length; bi++) {
    const numId = rawNumbers[bi].number_id;
    const tplId = rawNumbers[bi].template_id;
    const bucket = assignments.get(numId)!;
    const bucketRecipients = bucket.list;
    if (bucketRecipients.length === 0) continue;
    const bucketShiftSec = rawNumbers.length > 1 ? Math.floor((avgDelay / rawNumbers.length) * bi) : 0;
    // Per-number per-day cap (already enforced via bucketLimit, but slice respects it again).
    const perNumPerDayCap = perNumberCaps.get(numId) ?? perNumberQuota;

    const tagRow = (base: any) => ({
      ...base,
      whatsapp_number_id: numId,
      variables: { ...(base.variables || {}), __tpl_id: tplId },
    });

    // Group recipients by tz so each tz gets its own date/window calendar.
    const perTz = new Map<string, CleanRecipient[]>();
    for (const r of bucketRecipients) {
      const tz = respectTz ? tzFromPhone(r.contact_phone) : (recipientCountry ? (COUNTRY_TZ[recipientCountry] ?? "UTC") : "UTC");
      if (!perTz.has(tz)) perTz.set(tz, []);
      perTz.get(tz)!.push(r);
    }

    for (const [tz, list] of perTz) {
      // Date sequence: prefer operator-selected dates, but ALWAYS auto-extend
      // forward day-by-day if the bucket can't fit in the selected window
      // (e.g. relaunch wiped scheduled_dates, or capacity assumptions changed).
      // Without this fallback, line 618's endUtc-clamp piles tail recipients
      // into a single instant — they then either rate-limit out at Gupshup or
      // never send because they're past the day's window. See incident
      // 2026-05-13 SMB Owners (313 stuck at 05:00 UTC).
      const baseDates = scheduledDates.length > 0
        ? [...scheduledDates].sort()
        : [todayKeyTz(tz)];
      const neededDays = Math.max(1, Math.ceil(list.length / Math.max(1, perNumPerDayCap)));
      const dates = baseDates.slice();
      while (dates.length < neededDays) {
        dates.push(nextDateStr(dates[dates.length - 1]));
      }

      let cursor = 0;
      for (const date of dates) {
        if (cursor >= list.length) break;
        const slice = list.slice(cursor, cursor + perNumPerDayCap);
        cursor += slice.length;
        if (slice.length === 0) continue;

        const startUtc = dateAtTzToUTC(date, windowStart, tz).getTime() + bucketShiftSec * 1000;
        const endUtc = isBlastLaunch ? startUtc : dateAtTzToUTC(date, windowEnd, tz).getTime();
        // For "now" mode + today: don't schedule in the past — clamp to now+5s.
        const earliest = Math.max(startUtc, Date.now() + 5_000);
        const span = Math.max(60_000, endUtc - earliest);
        if (isBlastLaunch) {
          // marketing_instant: every recipient scheduled at the local-window start
          // (or now if window is open). NO 1s/recipient stagger — backpressure (per-number
          // and per-campaign inflight caps + provider backoff) controls the actual rate.
          // Note: this is per-recipient TZ — recipients in different timezones get
          // different scheduled_at values aligned to their own local window.
          const blastStart = Math.max(startUtc, Date.now());
          const instantNoStagger = dispatchMode === "marketing_instant";
          for (let i = 0; i < slice.length; i++) {
            rows.push(tagRow({
              ...slice[i],
              user_id: ownerId, workspace_id: wsId,
              campaign_id: campaign.id, status: "scheduled",
              scheduled_at: new Date(instantNoStagger ? blastStart : blastStart + i * 1000).toISOString(),
            }));
          }
        } else if (schedulerKind === "poisson") {
          const rate = slice.length / (span / 1000);
          let c = earliest;
          for (const r of slice) {
            c += Math.max(minGapSec, exponentialGap(rate)) * 1000;
            if (c > endUtc) c = endUtc - Math.floor(Math.random() * 60_000);
            rows.push(tagRow({
              ...r,
              user_id: ownerId, workspace_id: wsId,
              campaign_id: campaign.id, status: "scheduled",
              scheduled_at: new Date(c).toISOString(),
            }));
          }
        } else {
          const step = Math.max(minGapSec * 1000, span / Math.max(1, slice.length));
          for (let i = 0; i < slice.length; i++) {
            const jitter = (Math.random() - 0.5) * step * 0.4;
            const ts = earliest + i * step + jitter;
            rows.push(tagRow({
              ...slice[i],
              user_id: ownerId, workspace_id: wsId,
              campaign_id: campaign.id, status: "scheduled",
              scheduled_at: new Date(Math.min(endUtc, Math.max(earliest, ts))).toISOString(),
            }));
          }
        }
      }
    }
  }
  rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const { error: recipientsError } = await admin.from("campaign_recipients").insert(rows);
  if (recipientsError) return json({ error: recipientsError.message }, 500);

  // ------- Compute today_count + first_scheduled_at in recipient TZ -------
  const recipientTz = recipientCountry ? (COUNTRY_TZ[recipientCountry] ?? "UTC") : "UTC";
  const firstScheduledAtIso = rows.length > 0 ? rows[0].scheduled_at : new Date().toISOString();
  const todayKey = (() => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: recipientTz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  })();
  let todayCount = 0;
  for (const r of rows) {
    let key: string;
    try { key = new Intl.DateTimeFormat("en-CA", { timeZone: recipientTz }).format(new Date(r.scheduled_at)); }
    catch { key = String(r.scheduled_at).slice(0, 10); }
    if (key === todayKey) todayCount++;
  }

  // Decide initial visible status:
  //   - first send is within ~2 minutes -> running (worker will pick up immediately)
  //   - else -> scheduled (worker will promote to running ~60s before first send)
  const firstMs = new Date(firstScheduledAtIso).getTime();
  const initialStatus = firstMs <= Date.now() + 120_000 ? "running" : "scheduled";

  // Promote draft -> scheduled/running. This single UPDATE fires the Slack
  // trigger with today_recipients_count, first_scheduled_at, recipient_country
  // already populated.
  // Persist the actual date set used (which may have been auto-extended past
  // the operator-selected dates when capacity required it). This keeps the
  // day-rollover cron and the UI in sync with reality.
  const actualDates = Array.from(new Set(rows.map((r: any) => String(r.scheduled_at).slice(0, 10)))).sort();

  const { error: promoteErr } = await admin
    .from("campaigns")
    .update({
      status: initialStatus,
      scheduled_start_at: firstScheduledAtIso,
      first_scheduled_at: firstScheduledAtIso,
      today_recipients_count: todayCount,
      scheduled_dates: actualDates,
    })
    .eq("id", campaign.id);
  if (promoteErr) return json({ error: promoteErr.message }, 500);

  let immediate: any = null;
  if (scheduledDates.length === 0 && isBlastLaunch && firstMs <= Date.now() + 55_000) {
    try {
      const res = await processQueue(admin);
      immediate = await res.json();
    } catch (err) {
      immediate = { error: err instanceof Error ? err.message : "process failed" };
    }
  }

  // Slack notification handled by DB trigger on campaigns.status change.
  return json({
    ok: true,
    campaign_id: campaign.id,
    scheduled: rows.length,
    immediate,
    initial_status: initialStatus,
    capacity: { allocated: allocatedCapacity, requested: audienceTotalRequested, truncated: truncatedCount, per_number_caps: Object.fromEntries(perNumberCaps), days: daysCount },
  });
}

async function upsertTemplate(admin: any, requesterId: string, body: any) {
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

async function syncTemplates(admin: any, requesterId: string, body: any) {
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

    // --- Sample copy extraction ---------------------------------------------
    // Gupshup returns example values for {{1}}, {{2}}... in several shapes:
    //   - container.example: "[John|funding|Score improved]" (pipe string)
    //   - container.example: { body_text: [["John","funding","Score…"]] }
    //   - container.bodyExample: ["John","funding","Score…"]
    //   - t.example / t.exampleBody: same shapes
    // We normalize to a flat string[] aligned with `vars` order.
    // If the template has variables but no sample copy, we surface a warning
    // so the operator goes back to Gupshup and fills the "Sample" field.
    const variablesSampleRaw = parseGupshupExample(
      container.example ?? container.bodyExample ?? t.example ?? t.exampleBody ?? null,
      vars.length,
    );
    // Fallback: Gupshup often only ships the rendered "sampleText" (with [..] markers).
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

// Bulk sync: iterate every active number in the workspace (or for the requester if no workspace).
// Per-number failures are isolated and reported; one bad number never aborts the rest.
async function syncTemplatesAll(admin: any, requesterId: string, body: any) {
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

async function postGupshupTemplate({
  apiKey, source, destination, srcName, templateId, params,
}: { apiKey: string; source: string; destination: string; srcName: string | null; templateId: string; params: string[] }) {
  const form = new URLSearchParams();
  form.set("source", source);
  form.set("destination", destination);
  form.set("template", JSON.stringify({ id: templateId, params }));
  if (srcName) form.set("src.name", srcName);
  const res = await fetch("https://api.gupshup.io/wa/api/v1/template/msg", {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload };
}

async function sendTemplate(_admin: any, recipient: any) {
  const campaign = recipient.campaigns;
  const template = campaign?.message_templates;
  const number = campaign?.whatsapp_numbers;
  if (!campaign || !template || !number) throw new Error("Missing campaign data");

  // Mirror inbox send path: use the stored per-number key as-is. Do NOT discard
  // by "sk_" prefix - keys minted in the app's own Gupshup Settings -> API Keys
  // can carry that prefix and still be valid app keys. Never silently fall back
  // to the global env key (would send from a different number).
  const storedKey = (number.provider_api_key || "").toString().trim();
  if (!storedKey) throw new Error("This WhatsApp number has no per-number API key");

  const source = String(number.phone_number || "").replace(/[^\d]/g, "");
  const destination = String(recipient.contact_phone || "").replace(/[^\d]/g, "");
  const srcName = number.display_name ?? null;

  // Single source of truth - see supabase/functions/_shared/template.ts
  const params = buildTemplateParams(template, recipient.variables);
  const templateId = template.provider_template_id || template.name;

  // First attempt: stored key directly (same as inbox)
  let { res, payload } = await postGupshupTemplate({
    apiKey: storedKey, source, destination, srcName, templateId, params,
  });

  // Only on 401/403 with an sk_-prefixed key + app id, try partner-exchange retry (same as inbox)
  if ((res.status === 401 || res.status === 403) && storedKey.startsWith("sk_") && number.provider_app_id) {
    const exchanged = await getGupshupAppToken(number.provider_app_id, storedKey);
    if (exchanged.token) {
      ({ res, payload } = await postGupshupTemplate({
        apiKey: exchanged.token, source, destination, srcName, templateId, params,
      }));
    }
  }

  if (!res.ok || payload.status === "error") {
    throw new Error(JSON.stringify({ http_status: res.status, src_name: srcName, source, destination, body: payload }).slice(0, 800));
  }
  return payload;
}

// Single source of truth - see supabase/functions/_shared/template.ts
const renderTemplateBody = sharedRenderTemplateBody;

async function ensureCampaignConversation(admin: any, recipient: any): Promise<string | null> {
  const number = recipient.campaigns?.whatsapp_numbers;
  const numberId = recipient.campaigns?.whatsapp_number_id;
  const campaignPipelineId = recipient.campaigns?.pipeline_id ?? null;
  const workspaceId = recipient.workspace_id;
  const phone = String(recipient.contact_phone || "").replace(/[^\d]/g, "");
  if (!numberId || !phone) return recipient.conversation_id ?? null;

  if (recipient.conversation_id) return recipient.conversation_id;

  const { data: existing } = await admin
    .from("conversations")
    .select("id, pipeline_id")
    .eq("whatsapp_number_id", numberId)
    .eq("contact_phone", phone)
    .maybeSingle();
  if (existing) {
    // Heal stale pipeline assignment if conversation exists but pipeline differs.
    if (campaignPipelineId && existing.pipeline_id !== campaignPipelineId) {
      await admin.from("conversations").update({ pipeline_id: campaignPipelineId }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      user_id: recipient.user_id,
      workspace_id: workspaceId,
      whatsapp_number_id: numberId,
      contact_phone: phone,
      contact_name: recipient.contact_name ?? null,
      pipeline_id: campaignPipelineId,
      unread_count: 0,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("ensureCampaignConversation: failed to create", error);
    return null;
  }
  return created.id;
}

async function processQueue(admin: any) {
  // Lock contract: a recipient is "owned" by a tick once we successfully transition
  // it from 'scheduled' -> 'sending' below (the conditional UPDATE acts as the lock).
  // If a tick crashes or times out mid-send, the row stays in 'sending' indefinitely
  // and is invisible to subsequent ticks (which only claim 'scheduled'). Reap stuck
  // 'sending' rows older than 10 minutes back to 'scheduled' so they are retried.
  try {
    await admin.rpc("reap_stuck_sending_recipients", { p_idle_minutes: 10 });
  } catch (err) {
    console.warn("reap_stuck_sending_recipients failed", err);
  }

  // Promote scheduled campaigns whose first send is imminent to running.
  // The campaigns_status_change trigger then enqueues a `campaign_launched`
  // Slack event with today_recipients_count + recipient_country.
  try {
    await admin
      .from("campaigns")
      .update({ status: "running" })
      .eq("status", "scheduled")
      .lte("first_scheduled_at", new Date(Date.now() + 60_000).toISOString());
  } catch (err) {
    console.error("promote scheduled->running failed", err);
  }


  // Fetch enough due recipients for marketing blasts. Actual send speed is still
  // controlled below per WhatsApp number (1/sec for marketing, 60/sec for utility),
  // so this limit must not become a hidden campaign-level throttle.
  const perTickLimit = 500;

  // Look ahead window: pg_cron fires at minute boundaries, so fetch anything
  // due within the next ~55s and pace sends inside the tick. This honors the
  // configured min/max delay (which is randomized into scheduled_at) instead of
  // collapsing every send to xx:01 (the cron tick).
  const TICK_BUDGET_MS = 55_000;
  const tickStartedAt = Date.now();
  const horizonIso = new Date(tickStartedAt + TICK_BUDGET_MS).toISOString();

  const { data: due, error } = await admin
    .from("campaign_recipients")
    .select("id, user_id, workspace_id, campaign_id, conversation_id, contact_phone, contact_name, variables, scheduled_at, whatsapp_number_id, campaigns!inner(id, status, pipeline_id, whatsapp_number_id, delay_min_seconds, dispatch_mode, kill_switch_at, max_inflight_per_number, max_inflight_per_campaign, whatsapp_numbers(id, phone_number, provider_app_id, provider_api_key, display_name, paused_at, paused_reason), message_templates(id, name, language, body, variables, provider_template_id, category))")
    .eq("status", "scheduled")
    .lte("scheduled_at", horizonIso)
    .eq("campaigns.status", "running")
    .is("campaigns.kill_switch_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(perTickLimit);
  if (error) return json({ error: error.message }, 500);

  // Pre-load provider backoff state for all numbers in this tick.
  const tickNumIds = [...new Set((due ?? []).map((r: any) => r.whatsapp_number_id).filter(Boolean))];
  const backoffByNum = new Map<string, number>(); // number_id -> retry_after epoch ms
  if (tickNumIds.length > 0) {
    const { data: backoffRows } = await admin
      .from("provider_backoff")
      .select("whatsapp_number_id, retry_after")
      .in("whatsapp_number_id", tickNumIds);
    for (const b of backoffRows ?? []) {
      backoffByNum.set(b.whatsapp_number_id, new Date(b.retry_after).getTime());
    }
  }

  // Global instant kill switch.
  let instantGloballyDisabled = false;
  try {
    const { data: flag } = await admin.from("system_flags").select("value").eq("key", "marketing_instant_enabled").maybeSingle();
    if (flag && flag.value === false) instantGloballyDisabled = true;
  } catch (_) { /* best effort */ }

  const logEvent = async (rec: any, eventType: string, reason: string, payload: any = {}) => {
    try {
      await admin.from("campaign_dispatch_events").insert({
        campaign_id: rec.campaign_id,
        workspace_id: rec.workspace_id ?? null,
        whatsapp_number_id: rec.whatsapp_number_id ?? null,
        event_type: eventType,
        reason,
        payload,
      });
    } catch (_) { /* best effort */ }
  };

  // Resolve per-recipient number/template overrides (multi-number campaigns).
  // recipient.whatsapp_number_id is the assigned number; variables.__tpl_id is its template id.
  const overrideNumberIds = new Set<string>();
  const overrideTemplateIds = new Set<string>();
  for (const r of (due ?? [])) {
    const nid = (r as any).whatsapp_number_id;
    const tid = (r as any)?.variables?.__tpl_id;
    if (nid && nid !== r.campaigns?.whatsapp_number_id) overrideNumberIds.add(nid);
    if (typeof tid === "string" && tid !== r.campaigns?.message_templates?.id) overrideTemplateIds.add(tid);
  }
  const numberCache = new Map<string, any>();
  const templateCache = new Map<string, any>();
  if (overrideNumberIds.size > 0) {
    const { data: nrows } = await admin
      .from("whatsapp_numbers")
      .select("id, phone_number, provider_app_id, provider_api_key, display_name")
      .in("id", [...overrideNumberIds]);
    for (const n of nrows ?? []) numberCache.set(n.id, n);
  }
  if (overrideTemplateIds.size > 0) {
    const { data: trows } = await admin
      .from("message_templates")
      .select("id, name, language, body, variables, provider_template_id")
      .in("id", [...overrideTemplateIds]);
    for (const t of trows ?? []) templateCache.set(t.id, t);
  }
  // Apply overrides in-place so downstream code sees the right number/template.
  for (const r of (due ?? [])) {
    const nid = (r as any).whatsapp_number_id;
    const tid = (r as any)?.variables?.__tpl_id;
    if (nid && nid !== r.campaigns?.whatsapp_number_id) {
      const n = numberCache.get(nid);
      if (n && r.campaigns) {
        r.campaigns.whatsapp_number_id = n.id;
        r.campaigns.whatsapp_numbers = n;
      }
    }
    if (typeof tid === "string" && tid !== r.campaigns?.message_templates?.id) {
      const t = templateCache.get(tid);
      if (t && r.campaigns) r.campaigns.message_templates = t;
    }
  }

  let sent = 0;
  let failed = 0;
  const sentMu = { inc: () => { sent++; }, incFail: () => { failed++; } };

  // ============= Per-number daily cap safety net =============
  // Pre-fetch daily_send_limit per number in this tick. Then count how many
  // were already sent today (Dubai TZ) per number. We refuse to send a recipient
  // whose number has reached its cap and bump the row to next day at 09:00 Dubai.
  const numIdsInTick = [...new Set((due ?? []).map((r: any) => r.whatsapp_number_id).filter(Boolean))];
  const dailyLimitByNum = new Map<string, number>();
  const sentTodayByNum = new Map<string, number>();
  if (numIdsInTick.length > 0) {
    const { data: numRows } = await admin
      .from("whatsapp_numbers")
      .select("id, daily_send_limit")
      .in("id", numIdsInTick);
    for (const n of numRows ?? []) dailyLimitByNum.set(n.id, Math.max(1, Number(n.daily_send_limit ?? 200)));
    // Count sent today (Dubai) per number — single query.
    const dubaiTodayStartUtcMs = (() => {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" });
      const today = fmt.format(new Date()); // YYYY-MM-DD in Dubai
      // Dubai is UTC+4 always, so 00:00 Dubai = (today - 4h) UTC
      return new Date(`${today}T00:00:00+04:00`).getTime();
    })();
    const startIso = new Date(dubaiTodayStartUtcMs).toISOString();
    for (const nid of numIdsInTick) {
      const { count } = await admin
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("whatsapp_number_id", nid)
        .gte("sent_at", startIso)
        .not("sent_at", "is", null);
      sentTodayByNum.set(nid, count ?? 0);
    }
  }

  // Per-campaign canary state. If the first 3 sends for a campaign in this
  // tick all fail with the same provider error code (and zero successes),
  // halt the campaign and skip its remaining recipients - caps damage at
  // 3 wasted sends instead of 600 (Nov 2025 #131008 outage).
  type CanaryState = { ok: number; fail: number; codes: Map<string, number>; aborted: boolean };
  const canary = new Map<string, CanaryState>();
  const getCanary = (cid: string) => {
    let c = canary.get(cid);
    if (!c) { c = { ok: 0, fail: 0, codes: new Map(), aborted: false }; canary.set(cid, c); }
    return c;
  };
  const extractErrorCode = (msg: string): string => {
    const m = msg.match(/#(\d{4,6})/);
    return m ? `#${m[1]}` : msg.slice(0, 40).replace(/\s+/g, " ");
  };

  // ============= Per-number restriction detection =============
  // If a single number accumulates restriction-coded failures (Meta/Gupshup
  // codes that mean "this number is being throttled or banned"), force-flip
  // whatsapp_numbers.status -> 'restricted' so downstream sends stop and the
  // existing DB trigger fires Slack `number_restricted` immediately, instead
  // of waiting for the next health-sync tick.
  const RESTRICTION_CODES = new Set(["#131048", "#131056", "#368", "#131045"]);
  const restrictionFailsByNum = new Map<string, number>(); // tick-local count
  const flippedNums = new Set<string>(); // already flipped this tick
  const maybeFlipNumberRestricted = async (numId: string, sampleMsg: string, code: string) => {
    if (!numId || flippedNums.has(numId)) return;
    const tickCount = (restrictionFailsByNum.get(numId) ?? 0) + 1;
    restrictionFailsByNum.set(numId, tickCount);
    if (tickCount < 3) return; // wait for stronger signal before DB lookup
    // Confirm against last 5 minutes across all campaigns for this number.
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: rows } = await admin
      .from("campaign_recipients")
      .select("error_message")
      .eq("whatsapp_number_id", numId)
      .eq("status", "failed")
      .gte("updated_at", since)
      .limit(50);
    let total = 0;
    for (const r of rows ?? []) {
      const m = String(r.error_message || "").match(/#(\d{4,6})/);
      if (m && RESTRICTION_CODES.has(`#${m[1]}`)) total++;
    }
    if (total < 10) return;
    flippedNums.add(numId);
    // Read current status to avoid downgrading from 'banned'.
    const { data: nrow } = await admin
      .from("whatsapp_numbers")
      .select("status")
      .eq("id", numId)
      .maybeSingle();
    if (!nrow || nrow.status === "banned" || nrow.status === "restricted") return;
    const nowIso = new Date().toISOString();
    const { error: flipErr } = await admin
      .from("whatsapp_numbers")
      .update({ status: "restricted", restricted_at: nowIso })
      .eq("id", numId);
    if (flipErr) {
      console.error(`[restriction_flip_failed] number=${numId} err=${flipErr.message}`);
      return;
    }
    console.warn(`[number_auto_restricted] number=${numId} code=${code} failures_5min=${total} sample="${sampleMsg.slice(0, 200)}"`);
  };

  // ============= Per-number pacing state (shared by workers) =============
  // For paced/utility we serialize within a number using `lastSentMs`. For
  // marketing_instant the floor is 0 and parallelism is bounded by the
  // worker-pool size (= max_inflight_per_number).
  const lastSentMs = new Map<string, number>();

  // Pre-warm `lastSentMs` per number with one query each (avoids a per-recipient
  // round-trip inside processOne).
  for (const numId of numIdsInTick) {
    const { data: lastRow } = await admin
      .from("campaign_recipients")
      .select("sent_at")
      .eq("whatsapp_number_id", numId)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRow?.sent_at) lastSentMs.set(numId, new Date(lastRow.sent_at).getTime());
  }

  // ============= Per-campaign semaphore (max_inflight_per_campaign) =============
  type CampSem = { inflight: number; max: number; waiters: Array<() => void> };
  const campSem = new Map<string, CampSem>();
  const acquireCampSlot = async (cid: string, max: number): Promise<void> => {
    let s = campSem.get(cid);
    if (!s) { s = { inflight: 0, max, waiters: [] }; campSem.set(cid, s); }
    s.max = Math.max(s.max, max); // grow if a different recipient asks for higher
    if (s.inflight < s.max) { s.inflight++; return; }
    await new Promise<void>((res) => s!.waiters.push(res));
    s.inflight++;
  };
  const releaseCampSlot = (cid: string) => {
    const s = campSem.get(cid);
    if (!s) return;
    s.inflight = Math.max(0, s.inflight - 1);
    const next = s.waiters.shift();
    if (next) next();
  };

  // ============= Process one recipient (used by all workers) =============
  // Returns true if a send was attempted (success or failure), false if skipped.
  const processOneRecipient = async (recipient: any): Promise<void> => {
    const cState = getCanary(recipient.campaign_id);
    if (cState.aborted) return;

    const camp = recipient.campaigns ?? {};
    const isInstant = camp.dispatch_mode === "marketing_instant";

    if (isInstant && instantGloballyDisabled) {
      await logEvent(recipient, "skipped", "instant_mode_disabled");
      return;
    }
    const numRow = camp.whatsapp_numbers ?? null;
    if (numRow?.paused_at) {
      await logEvent(recipient, "idle", "sender_paused", { paused_reason: numRow.paused_reason });
      return;
    }
    const recNumIdEarly = recipient.whatsapp_number_id;
    const backoffUntil = recNumIdEarly ? backoffByNum.get(recNumIdEarly) : undefined;
    if (backoffUntil && backoffUntil > Date.now()) {
      await logEvent(recipient, "idle", "provider_backoff", { retry_after: new Date(backoffUntil).toISOString() });
      return;
    }

    // Honor scheduled_at for paced mode. Instant mode pushes immediately.
    const targetMs = new Date(recipient.scheduled_at).getTime();
    const waitMs = targetMs - Date.now();
    const remainingBudget = TICK_BUDGET_MS - (Date.now() - tickStartedAt);
    if (!isInstant && waitMs > 0 && remainingBudget > 0) {
      await new Promise((r) => setTimeout(r, Math.min(waitMs, remainingBudget)));
    }
    if (Date.now() - tickStartedAt > TICK_BUDGET_MS) return;

    // Daily-cap safety net (Dubai TZ). Bumps to tomorrow 09:00 if cap reached.
    const recNumId = recipient.whatsapp_number_id;
    if (recNumId && dailyLimitByNum.has(recNumId)) {
      const cap = dailyLimitByNum.get(recNumId)!;
      const sentNow = sentTodayByNum.get(recNumId) ?? 0;
      if (sentNow >= cap) {
        const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const dubaiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(next);
        const bumpedIso = new Date(`${dubaiDate}T09:00:00+04:00`).toISOString();
        await admin
          .from("campaign_recipients")
          .update({ scheduled_at: bumpedIso })
          .eq("id", recipient.id)
          .eq("status", "scheduled");
        try {
          const { data: minRow } = await admin
            .from("campaign_recipients")
            .select("scheduled_at")
            .eq("campaign_id", recipient.campaign_id)
            .eq("status", "scheduled")
            .is("sent_at", null)
            .order("scheduled_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          const todayStartIso = (() => {
            const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
            return new Date(`${k}T00:00:00+04:00`).toISOString();
          })();
          const tomorrowStartIso = (() => {
            const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
            return new Date(`${k}T00:00:00+04:00`).toISOString();
          })();
          const { count: todayLeft } = await admin
            .from("campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", recipient.campaign_id)
            .gte("scheduled_at", todayStartIso)
            .lt("scheduled_at", tomorrowStartIso);
          await admin.from("campaigns").update({
            first_scheduled_at: minRow?.scheduled_at ?? bumpedIso,
            today_recipients_count: todayLeft ?? 0,
          }).eq("id", recipient.campaign_id);
        } catch (_) { /* best-effort */ }
        await logEvent(recipient, "idle", "daily_cap_reached", { cap, sent_today: sentNow });
        return;
      }
    }

    // Pacing floor — only meaningful for paced/utility (instant => floor 0).
    const tplCategory = String(recipient.campaigns?.message_templates?.category || "marketing").toLowerCase();
    const isUtility = tplCategory === "utility" || tplCategory === "authentication";
    const configuredMin = Number(recipient.campaigns?.delay_min_seconds ?? 0) || 0;
    const floor = isInstant ? 0 : (isUtility ? 60 : 1);
    const minGapMs = Math.max(floor, configuredMin) * 1000;
    const pacingKey = recipient.whatsapp_number_id || recipient.campaigns?.whatsapp_number_id || recipient.campaign_id;
    if (minGapMs > 0) {
      const lastMs = lastSentMs.get(pacingKey) ?? 0;
      if (lastMs) {
        const since = Date.now() - lastMs;
        if (since < minGapMs) {
          const extra = minGapMs - since;
          const budgetLeft = TICK_BUDGET_MS - (Date.now() - tickStartedAt);
          if (extra > budgetLeft) return; // try next tick
          await new Promise((r) => setTimeout(r, extra));
        }
      }
    }

    // Atomic claim.
    const { data: locked } = await admin
      .from("campaign_recipients")
      .update({ status: "sending" })
      .eq("id", recipient.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!locked) return;
    lastSentMs.set(pacingKey, Date.now());

    try {
      const gsBody = await sendTemplate(admin, recipient);
      const providerId = gsBody.messageId || null;
      const tpl = recipient.campaigns?.message_templates;
      const variableNames: string[] = Array.isArray(tpl?.variables) ? tpl.variables : [];
      const renderedBody = renderTemplateBody(tpl?.body, variableNames, recipient.variables) || `[Template] ${tpl?.name ?? ""}`.trim();
      const sentAt = new Date().toISOString();

      const conversationId = await ensureCampaignConversation(admin, recipient);

      await admin.from("campaign_recipients").update({
        status: "sent",
        sent_at: sentAt,
        provider_message_id: providerId,
        conversation_id: conversationId,
      }).eq("id", recipient.id);

      if (conversationId) {
        await admin.from("messages").insert({
          user_id: recipient.user_id,
          conversation_id: conversationId,
          direction: "outbound",
          body: renderedBody,
          status: "sent",
          provider_message_id: providerId,
          metadata: {
            campaign_id: recipient.campaign_id,
            campaign_recipient_id: recipient.id,
            template_id: tpl?.id ?? null,
            template_name: tpl?.name ?? null,
            source: "campaign_opener",
            gupshup_response: gsBody,
          },
        });
        await admin.from("conversations").update({
          last_message_text: renderedBody.slice(0, 500),
          last_message_at: sentAt,
        }).eq("id", conversationId);
      }
      cState.ok += 1;
      sentMu.inc();
      if (recipient.whatsapp_number_id) {
        sentTodayByNum.set(recipient.whatsapp_number_id, (sentTodayByNum.get(recipient.whatsapp_number_id) ?? 0) + 1);
      }
    } catch (err) {
      sentMu.incFail();
      const msg = err instanceof Error ? err.message : "Send failed";
      await admin.from("campaign_recipients").update({ status: "failed", error_message: msg }).eq("id", recipient.id);

      cState.fail += 1;
      const code = extractErrorCode(msg);
      cState.codes.set(code, (cState.codes.get(code) ?? 0) + 1);

      const httpMatch = msg.match(/"http_status":(\d{3})/);
      const httpStatus = httpMatch ? parseInt(httpMatch[1], 10) : 0;
      if (recipient.whatsapp_number_id && (httpStatus === 429 || httpStatus >= 500)) {
        try {
          const retryAfterMatch = msg.match(/retry[_-]?after[":\s]+(\d+)/i);
          const baseSec = retryAfterMatch ? Math.min(600, parseInt(retryAfterMatch[1], 10)) : 30;
          const { data: existing } = await admin
            .from("provider_backoff")
            .select("attempt_count")
            .eq("whatsapp_number_id", recipient.whatsapp_number_id)
            .maybeSingle();
          const attempt = Math.min(8, (existing?.attempt_count ?? 0) + 1);
          const delaySec = Math.min(600, baseSec * Math.pow(2, attempt - 1));
          const retryAfter = new Date(Date.now() + delaySec * 1000).toISOString();
          await admin.from("provider_backoff").upsert({
            whatsapp_number_id: recipient.whatsapp_number_id,
            retry_after: retryAfter,
            last_status: httpStatus,
            last_error: msg.slice(0, 500),
            attempt_count: attempt,
            updated_at: new Date().toISOString(),
          });
          backoffByNum.set(recipient.whatsapp_number_id, new Date(retryAfter).getTime());
          await logEvent(recipient, "error", httpStatus === 429 ? "provider_429" : "provider_5xx", { http_status: httpStatus, retry_after: retryAfter });
        } catch (_) { /* best effort */ }
      }

      if (recipient.whatsapp_number_id && RESTRICTION_CODES.has(code)) {
        await maybeFlipNumberRestricted(recipient.whatsapp_number_id, msg, code);
      }

      if (!cState.aborted && cState.fail >= 3 && cState.ok === 0) {
        const top = [...cState.codes.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top && top[1] === cState.fail) {
          cState.aborted = true;
          try {
            await admin.from("campaigns").update({ status: "failed" }).eq("id", recipient.campaign_id);
            await admin.from("slack_event_queue").insert({
              event_type: "campaign_failed",
              workspace_id: recipient.workspace_id,
              payload: {
                campaign_id: recipient.campaign_id,
                reason: "canary_uniform_failure",
                error_code: top[0],
                failures: cState.fail,
                sample_error: msg.slice(0, 400),
              },
            });
          } catch (abortErr) {
            console.error("canary abort failed", abortErr);
          }
        }
      }
    }
  };

  // ============= Bounded-concurrency worker pool =============
  // Recipients are grouped by sender number. Each group runs N workers, where
  // N = max_inflight_per_number for that group's campaign (1 if paced/utility,
  // since the per-number floor would serialize them anyway). A per-campaign
  // semaphore enforces max_inflight_per_campaign across all groups.
  const byNumber = new Map<string, any[]>();
  for (const r of due ?? []) {
    const key = r.whatsapp_number_id || `__nonum__${r.campaign_id}`;
    let arr = byNumber.get(key);
    if (!arr) { arr = []; byNumber.set(key, arr); }
    arr.push(r);
  }

  const groupTasks: Promise<void>[] = [];
  for (const [, recipients] of byNumber) {
    const first = recipients[0];
    const camp = first.campaigns ?? {};
    const isInstant = camp.dispatch_mode === "marketing_instant";
    const tplCategory = String(first.campaigns?.message_templates?.category || "marketing").toLowerCase();
    const isUtility = tplCategory === "utility" || tplCategory === "authentication";
    const perNumberFloor = isInstant ? 0 : (isUtility ? 60 : 1);
    const perNumberCap = Math.max(1, Number(camp.max_inflight_per_number ?? 5));
    // Paced/utility floor>0 forces serialization within a number.
    const parallel = perNumberFloor > 0 ? 1 : Math.min(perNumberCap, recipients.length);

    let cursor = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < parallel; w++) {
      workers.push((async () => {
        while (true) {
          if (Date.now() - tickStartedAt > TICK_BUDGET_MS) return;
          const r = recipients[cursor++];
          if (!r) return;
          const cState = getCanary(r.campaign_id);
          if (cState.aborted) continue;
          const campMax = Math.max(1, Number(r.campaigns?.max_inflight_per_campaign ?? 50));
          await acquireCampSlot(r.campaign_id, campMax);
          try {
            await processOneRecipient(r);
          } finally {
            releaseCampSlot(r.campaign_id);
          }
        }
      })());
    }
    groupTasks.push(Promise.all(workers).then(() => {}));
  }
  await Promise.all(groupTasks);


  const campaignIds = [...new Set((due ?? []).map((r: any) => r.campaign_id))];
  if (campaignIds.length > 0) {
    // Single aggregate call instead of 3 count(*) queries per campaign.
    const { data: counts } = await admin.rpc("campaign_recipient_counts", { p_campaign_ids: campaignIds });
    const byId = new Map<string, { sent: number; failed: number; pending: number }>();
    for (const row of counts ?? []) {
      byId.set(row.campaign_id, {
        sent: Number(row.sent_count ?? 0),
        failed: Number(row.failed_count ?? 0),
        pending: Number(row.pending_count ?? 0),
      });
    }
    for (const id of campaignIds) {
      const c = byId.get(id) ?? { sent: 0, failed: 0, pending: 0 };
      await admin.from("campaigns").update({
        sent_count: c.sent,
        failed_count: c.failed,
        status: c.pending === 0 ? "completed" : "running",
      }).eq("id", id);
    }
  }

  // Reaper: catch any 'running' campaign whose recipients all reached terminal state
  // but the per-tick recount above never touched it (no recipient was due this tick).
  try {
    await admin.rpc("reap_finished_campaigns", { p_idle_minutes: 5 });
  } catch (err) {
    console.warn("reap_finished_campaigns failed", err);
  }

  return json({ ok: true, processed: (due ?? []).length, sent, failed });
}

async function blastCampaign(admin: any, requesterId: string, body: any) {
  const campaignId = String(body.campaign_id || "");
  if (!uuidRegex.test(campaignId)) return json({ error: "campaign_id required" }, 400);

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, whatsapp_numbers(phone_number, provider_app_id, provider_api_key, display_name), message_templates(name, language, variables, provider_template_id)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return json({ error: "Campaign not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, campaign.user_id))) return json({ error: "Forbidden" }, 403);

  const { data: recipients, error: recipErr } = await admin
    .from("campaign_recipients")
    .select("id, user_id, conversation_id, contact_phone, contact_name, variables, campaign_id")
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "scheduled"])
    .limit(1000);
  if (recipErr) return json({ error: recipErr.message }, 500);
  if (!recipients?.length) return json({ ok: true, processed: 0, note: "no scheduled recipients" });

  // Lock all
  const ids = recipients.map((r: any) => r.id);
  await admin.from("campaign_recipients").update({ status: "sending" }).in("id", ids);

  const t0 = Date.now();
  const results = await Promise.allSettled(
    recipients.map(async (r: any) => {
      const tStart = Date.now();
      try {
        const gsBody = await sendTemplate(admin, { ...r, campaigns: campaign });
        const tEnd = Date.now();
        const providerId = gsBody.messageId || null;
        await admin.from("campaign_recipients").update({
          status: "sent",
          sent_at: new Date(tEnd).toISOString(),
          provider_message_id: providerId,
        }).eq("id", r.id);
        return { id: r.id, phone: r.contact_phone, ok: true, ms: tEnd - tStart, offset_ms: tStart - t0, end_offset_ms: tEnd - t0, providerId };
      } catch (err) {
        const tEnd = Date.now();
        const msg = err instanceof Error ? err.message : "send failed";
        await admin.from("campaign_recipients").update({ status: "failed", error_message: msg.slice(0, 500) }).eq("id", r.id);
        return { id: r.id, phone: r.contact_phone, ok: false, ms: tEnd - tStart, offset_ms: tStart - t0, end_offset_ms: tEnd - t0, error: msg.slice(0, 300) };
      }
    }),
  );
  const tTotal = Date.now() - t0;

  const flat = results.map((r: any) => r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason).slice(0, 300) });
  const sent = flat.filter((r: any) => r.ok).length;
  const failed = flat.length - sent;

  await admin.from("campaigns").update({
    sent_count: sent,
    failed_count: failed,
    status: "completed",
  }).eq("id", campaignId);

  // Timing summary
  const okTimes = flat.filter((r: any) => r.ok).map((r: any) => r.ms);
  const sortedEnd = flat.map((r: any) => r.end_offset_ms ?? 0).sort((a, b) => a - b);
  const summary = {
    total: flat.length,
    sent,
    failed,
    total_wallclock_ms: tTotal,
    per_send_ms_avg: okTimes.length ? Math.round(okTimes.reduce((a, b) => a + b, 0) / okTimes.length) : null,
    per_send_ms_min: okTimes.length ? Math.min(...okTimes) : null,
    per_send_ms_max: okTimes.length ? Math.max(...okTimes) : null,
    p50_finish_ms: sortedEnd[Math.floor(sortedEnd.length * 0.5)] ?? null,
    p95_finish_ms: sortedEnd[Math.floor(sortedEnd.length * 0.95)] ?? null,
    p100_finish_ms: sortedEnd[sortedEnd.length - 1] ?? null,
  };

}

// ===== Campaign control: pause / resume / cancel =====
async function setCampaignStatus(admin: any, requesterId: string, body: any, kind: "pause" | "resume" | "cancel") {
  const ids: string[] = Array.isArray(body.campaign_ids) ? body.campaign_ids.filter((x: any) => uuidRegex.test(x)) : [];
  if (body.campaign_id && uuidRegex.test(body.campaign_id)) ids.push(body.campaign_id);
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return json({ error: "campaign_id required" }, 400);

  const { data: rows } = await admin.from("campaigns").select("id, user_id, status, first_scheduled_at").in("id", uniq);
  if (!rows || rows.length === 0) return json({ error: "Not found" }, 404);
  for (const r of rows) {
    if (!(await canAccessUser(admin, requesterId, r.user_id))) return json({ error: "Forbidden" }, 403);
  }

  const updates: Record<string, string[]> = {};
  for (const r of rows) {
    let next: string;
    if (kind === "pause") next = "paused";
    else if (kind === "cancel") next = "cancelled";
    else {
      // resume: scheduled if first send is in future (>2m), else running
      const firstMs = r.first_scheduled_at ? new Date(r.first_scheduled_at).getTime() : 0;
      next = firstMs > Date.now() + 120_000 ? "scheduled" : "running";
    }
    (updates[next] ||= []).push(r.id);
  }
  for (const [status, list] of Object.entries(updates)) {
    const { error } = await admin.from("campaigns").update({ status }).in("id", list);
    if (error) return json({ error: error.message }, 500);
  }
  // On cancel: release audience rows reserved/marked-used for these campaigns back into the pool.
  if (kind === "cancel") {
    const cancelled = updates["cancelled"] ?? [];
    if (cancelled.length > 0) {
      await admin
        .from("audience_rows")
        .update({ usage_status: "unused", reserved_at: null, used_at: null, used_in_campaign_id: null })
        .in("used_in_campaign_id", cancelled);
    }
  }
  return json({ ok: true, action: kind, campaigns: uniq.length });
}

// ===== Redistribute: re-schedule pending recipients with current quota / window =====
// Body: { campaign_ids: string[], skip_dates?: string[], extra_dates?: string[],
//         per_number_quota?: number, window_start?: "HH:MM", window_end?: "HH:MM" }
async function redistributeCampaign(admin: any, requesterId: string, body: any) {
  const ids: string[] = Array.isArray(body.campaign_ids) ? body.campaign_ids.filter((x: any) => uuidRegex.test(x)) : [];
  if (body.campaign_id && uuidRegex.test(body.campaign_id)) ids.push(body.campaign_id);
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return json({ error: "campaign_id required" }, 400);

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id, user_id, workspace_id, whatsapp_number_id, schedule_window_start, schedule_window_end, scheduled_dates, per_number_quota, delay_min_seconds, delay_max_seconds, recipient_country, respect_recipient_tz, first_scheduled_at, status")
    .in("id", uniq);
  if (!campaigns || campaigns.length === 0) return json({ error: "Not found" }, 404);
  for (const c of campaigns) {
    if (!(await canAccessUser(admin, requesterId, c.user_id))) return json({ error: "Forbidden" }, 403);
  }

  const skipSet = new Set<string>(Array.isArray(body.skip_dates) ? body.skip_dates.filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []);
  const extraDates: string[] = Array.isArray(body.extra_dates) ? body.extra_dates.filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  const overrideQuota = body.per_number_quota != null
    ? Math.max(1, Math.min(200, Math.floor(Number(body.per_number_quota))))
    : null;
  const overrideWindowStart = typeof body.window_start === "string" && /^\d{2}:\d{2}$/.test(body.window_start) ? body.window_start : null;
  const overrideWindowEnd = typeof body.window_end === "string" && /^\d{2}:\d{2}$/.test(body.window_end) ? body.window_end : null;

  const todayKeyTz = (tz: string) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const nextDateStr = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };

  let totalUpdated = 0;
  const newFirstByCampaign: Record<string, string> = {};
  const newTodayByCampaign: Record<string, number> = {};

  for (const c of campaigns) {
    const quota = overrideQuota ?? Math.max(1, Math.min(200, c.per_number_quota || 200));
    const winStart = overrideWindowStart ?? String(c.schedule_window_start || "09:00:00").slice(0, 5);
    const winEnd = overrideWindowEnd ?? String(c.schedule_window_end || "18:00:00").slice(0, 5);
    const minDelay = Math.max(60, c.delay_min_seconds || 60);
    const wsMin = hhmmToMin(winStart);
    const wsMax = hhmmToMin(winEnd);
    const windowSeconds = Math.max(60, (wsMax - wsMin) * 60);
    const windowFitCap = Math.max(1, Math.floor(windowSeconds / minDelay));
    const effectiveQuota = Math.max(1, Math.min(quota, windowFitCap));
    const recipientTz = c.recipient_country ? (COUNTRY_TZ[String(c.recipient_country).toUpperCase()] ?? "UTC") : "UTC";
    const todayKeyMain = todayKeyTz(recipientTz);

    // Load all PENDING recipients for this campaign (status=scheduled, no sent_at)
    const pending: any[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await admin
        .from("campaign_recipients")
        .select("id, contact_phone, scheduled_at")
        .eq("campaign_id", c.id)
        .eq("status", "scheduled")
        .is("sent_at", null)
        .order("scheduled_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) return json({ error: error.message }, 500);
      const rows = data ?? [];
      pending.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    if (pending.length === 0) continue;

    // Group by tz
    const respectTz = c.respect_recipient_tz !== false;
    const perTz = new Map<string, any[]>();
    for (const r of pending) {
      const tz = respectTz ? tzFromPhone(r.contact_phone) : recipientTz;
      if (!perTz.has(tz)) perTz.set(tz, []);
      perTz.get(tz)!.push(r);
    }

    // Build base date list. Honor existing scheduled_dates (minus skipped, plus extra),
    // ensure today is included if status is running/scheduled.
    const baseDates = (() => {
      const set = new Set<string>([
        ...(Array.isArray(c.scheduled_dates) ? c.scheduled_dates as string[] : []),
        ...extraDates,
      ]);
      const out = [...set].filter((d) => d >= todayKeyMain && !skipSet.has(d)).sort();
      if (out.length === 0) out.push(todayKeyMain);
      return out;
    })();

    const newScheduledAt = new Map<string, string>();
    let firstIso: string | null = null;
    let todayCount = 0;

    for (const [tz, list] of perTz) {
      const dates = [...baseDates];
      const need = Math.ceil(list.length / effectiveQuota);
      while (dates.length < need) dates.push(nextDateStr(dates[dates.length - 1]));

      let cursor = 0;
      for (const date of dates) {
        if (cursor >= list.length) break;
        const slice = list.slice(cursor, cursor + effectiveQuota);
        cursor += slice.length;
        if (slice.length === 0) continue;

        const startUtc = dateAtTzToUTC(date, winStart, tz).getTime();
        const endUtc = dateAtTzToUTC(date, winEnd, tz).getTime();
        const earliest = Math.max(startUtc, Date.now() + 5_000);
        const span = Math.max(60_000, endUtc - earliest);
        const step = Math.max(minDelay * 1000, span / Math.max(1, slice.length));

        for (let i = 0; i < slice.length; i++) {
          const jitter = (Math.random() - 0.5) * step * 0.4;
          const ts = Math.min(endUtc, Math.max(earliest, earliest + i * step + jitter));
          const iso = new Date(ts).toISOString();
          newScheduledAt.set(slice[i].id, iso);
          if (!firstIso || iso < firstIso) firstIso = iso;
          // Count today (recipient main tz)
          let key: string;
          try { key = new Intl.DateTimeFormat("en-CA", { timeZone: recipientTz }).format(new Date(ts)); }
          catch { key = iso.slice(0, 10); }
          if (key === todayKeyMain) todayCount++;
        }
      }
    }

    // Bulk update — chunk by 500 ids using upsert via individual updates
    const entries = [...newScheduledAt.entries()];
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      // Use update one-by-one in parallel for simplicity (modest sizes)
      await Promise.all(chunk.map(([id, iso]) =>
        admin.from("campaign_recipients").update({ scheduled_at: iso }).eq("id", id)
      ));
    }
    totalUpdated += entries.length;
    if (firstIso) newFirstByCampaign[c.id] = firstIso;
    newTodayByCampaign[c.id] = todayCount;

    // Patch campaign metadata
    const patch: any = {
      per_number_quota: effectiveQuota,
      schedule_window_start: winStart + ":00",
      schedule_window_end: winEnd + ":00",
      scheduled_dates: baseDates,
      today_recipients_count: todayCount,
    };
    if (firstIso) {
      patch.first_scheduled_at = firstIso;
      patch.scheduled_start_at = firstIso;
    }
    await admin.from("campaigns").update(patch).eq("id", c.id);
  }

  return json({ ok: true, updated: totalUpdated, campaigns: uniq.length, first_scheduled_at: newFirstByCampaign, today_recipients_count: newTodayByCampaign });
}


// ===== Retry failed recipients with the campaign's own pacing rules =====
// Body: { campaign_id }. Resets all `failed` recipients to `scheduled`,
// rebuilds scheduled_at per (whatsapp_number_id) honoring delay_min_seconds /
// delay_max_seconds and the schedule window. Re-opens the campaign.
//
// This exists so re-queuing failures never has to be done with hand-written
// SQL again (Nov 2025: ad-hoc retry blasted at 10x intended pace).
async function retryFailedRecipients(admin: any, requesterId: string, body: any) {
  const campaignId = String(body.campaign_id || "");
  if (!uuidRegex.test(campaignId)) return json({ error: "campaign_id required" }, 400);

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, user_id, workspace_id, status, delay_min_seconds, delay_max_seconds, schedule_window_start, schedule_window_end, recipient_country, respect_recipient_tz")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return json({ error: "Not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, campaign.user_id))) return json({ error: "Forbidden" }, 403);

  const minDelay = Math.max(60, campaign.delay_min_seconds || 60);
  const maxDelay = Math.max(minDelay, campaign.delay_max_seconds || 120);
  const winStart = String(campaign.schedule_window_start || "09:00:00").slice(0, 5);
  const winEnd = String(campaign.schedule_window_end || "18:00:00").slice(0, 5);
  const respectTz = campaign.respect_recipient_tz !== false;
  const recipientTz = campaign.recipient_country
    ? (COUNTRY_TZ[String(campaign.recipient_country).toUpperCase()] ?? "UTC")
    : "UTC";

  const failed: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("campaign_recipients")
      .select("id, contact_phone, whatsapp_number_id")
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .range(from, from + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    const rows = data ?? [];
    failed.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  if (failed.length === 0) return json({ ok: true, retried: 0 });

  const byNumber = new Map<string, any[]>();
  for (const r of failed) {
    const k = r.whatsapp_number_id || "__none__";
    if (!byNumber.has(k)) byNumber.set(k, []);
    byNumber.get(k)!.push(r);
  }

  const todayKeyTz = (tz: string) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const nextDateStr = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };

  const updates: Array<{ id: string; iso: string }> = [];
  for (const list of byNumber.values()) {
    const tz = respectTz && list[0]?.contact_phone ? tzFromPhone(list[0].contact_phone) : recipientTz;
    let date = todayKeyTz(tz);
    let cursor = Math.max(Date.now() + 5_000, dateAtTzToUTC(date, winStart, tz).getTime());
    let endOfDay = dateAtTzToUTC(date, winEnd, tz).getTime();
    if (cursor >= endOfDay) {
      date = nextDateStr(date);
      cursor = dateAtTzToUTC(date, winStart, tz).getTime();
      endOfDay = dateAtTzToUTC(date, winEnd, tz).getTime();
    }
    for (const r of list) {
      if (cursor >= endOfDay) {
        date = nextDateStr(date);
        cursor = dateAtTzToUTC(date, winStart, tz).getTime();
        endOfDay = dateAtTzToUTC(date, winEnd, tz).getTime();
      }
      updates.push({ id: r.id, iso: new Date(cursor).toISOString() });
      cursor += randomDelay(minDelay, maxDelay) * 1000;
    }
  }

  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await Promise.all(chunk.map((u) =>
      admin.from("campaign_recipients").update({
        status: "scheduled",
        scheduled_at: u.iso,
        error_message: null,
        provider_message_id: null,
      }).eq("id", u.id)
    ));
  }

  const firstIso = updates.length > 0 ? updates[0].iso : new Date().toISOString();
  const initialStatus = new Date(firstIso).getTime() <= Date.now() + 120_000 ? "running" : "scheduled";
  await admin.from("campaigns").update({
    status: initialStatus,
    failed_count: 0,
    first_scheduled_at: firstIso,
    scheduled_start_at: firstIso,
  }).eq("id", campaignId);

  return json({ ok: true, retried: updates.length, first_scheduled_at: firstIso, status: initialStatus });
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "process");

    if (action === "process") {
      // Cron + manual dispatch. Gate: either valid CRON_SECRET, OR service-role bearer, OR allow (cron uses pg_net from trusted DB)
      const cronSecret = Deno.env.get("CRON_SECRET");
      const provided = req.headers.get("x-cron-secret") ?? "";
      const authHeader = req.headers.get("authorization") ?? "";
      const isServiceAuth = authHeader.includes(serviceKey);
      if (cronSecret && provided && provided !== cronSecret && !isServiceAuth) {
        return json({ error: "Unauthorized" }, 401);
      }
      // Cron + manual triggers can fire concurrently; serialize processQueue
      // so two ticks don't pick up the same scheduled recipients and double-send.
      const release = await acquireJobLock(admin, "campaigns-process");
      if (!release) return json({ ok: true, skipped: "locked" });
      try {
        return await processQueue(admin);
      } finally {
        await release();
      }
    }

    const auth = await getUser(req, supabaseUrl, anonKey);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    if (action === "launch") return await launchCampaign(admin, auth.user.id, body);
    if (action === "blast") return await blastCampaign(admin, auth.user.id, body);
    if (action === "prepare") return await prepareCampaign(admin, auth.user.id, body);
    if (action === "kill_switch") return await killSwitch(admin, auth.user.id, body);
    if (action === "runtime_status") return await runtimeStatus(admin, auth.user.id, body);
    if (action === "upsert_template") return await upsertTemplate(admin, auth.user.id, body);
    if (action === "sync_templates") return await syncTemplates(admin, auth.user.id, body);
    if (action === "sync_templates_all") return await syncTemplatesAll(admin, auth.user.id, body);
    if (action === "pause" || action === "resume" || action === "cancel") {
      return await setCampaignStatus(admin, auth.user.id, body, action);
    }
    if (action === "redistribute") return await redistributeCampaign(admin, auth.user.id, body);
    if (action === "retry_failed") return await retryFailedRecipients(admin, auth.user.id, body);
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("campaigns error", msg);
    return json({ error: msg }, 500);
  }
});

// ===== Marketing Instant: prepare snapshot, kill switch, runtime status =====

async function computeSnapshotSignature(input: {
  numberIds: string[];
  templateIds: string[];
  audienceCount: number;
  windowStart: string;
  windowEnd: string;
  perNumberQuota: number;
  maxInflightPerNumber: number;
  maxInflightPerCampaign: number;
}): Promise<string> {
  const sorted = {
    n: [...input.numberIds].sort(),
    t: [...input.templateIds].sort(),
    a: input.audienceCount,
    ws: input.windowStart,
    we: input.windowEnd,
    q: input.perNumberQuota,
    in: input.maxInflightPerNumber,
    ic: input.maxInflightPerCampaign,
  };
  const txt = JSON.stringify(sorted);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return "sha256:" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Build a prepared snapshot for a campaign. Operator must call this before launch
// for marketing_instant; the launch endpoint enforces freshness + signature match.
async function prepareCampaign(admin: any, requesterId: string, body: any) {
  const numbers: Array<{ number_id: string; template_id: string }> =
    Array.isArray(body.numbers) ? body.numbers
      .map((n: any) => ({ number_id: String(n?.number_id || ""), template_id: String(n?.template_id || "") }))
      .filter((n: any) => uuidRegex.test(n.number_id) && uuidRegex.test(n.template_id))
      : [];
  const audienceCount = Math.max(0, Math.floor(Number(body.audience_count ?? 0)));
  const dispatchMode: "paced" | "marketing_instant" =
    body.dispatch_mode === "marketing_instant" ? "marketing_instant" : "paced";
  const perNumberQuota = Math.max(1, Math.min(200, Math.floor(Number(body.per_number_quota ?? 200))));
  const maxInflightPerNumber = Math.max(1, Math.min(500, Math.floor(Number(body.max_inflight_per_number ?? 5))));
  const maxInflightPerCampaign = Math.max(1, Math.min(5000, Math.floor(Number(body.max_inflight_per_campaign ?? 50))));
  const windowStart: string = typeof body.window_start === "string" ? body.window_start : "09:00";
  const windowEnd: string = typeof body.window_end === "string" ? body.window_end : "18:00";
  const reuseCampaignId: string | null =
    typeof body.campaign_id === "string" && uuidRegex.test(body.campaign_id) ? body.campaign_id : null;

  if (numbers.length === 0) return json({ error: "At least one number+template required" }, 400);
  if (audienceCount <= 0) return json({ error: "audience_count required" }, 400);

  const numberIds = [...new Set(numbers.map((n) => n.number_id))];
  const templateIds = [...new Set(numbers.map((n) => n.template_id))];

  const { data: numberRows } = await admin
    .from("whatsapp_numbers")
    .select("id, user_id, workspace_id, phone_number, status, webhook_connected, paused_at, paused_reason, daily_send_limit, provider_app_id, provider_api_key")
    .in("id", numberIds);
  if (!numberRows || numberRows.length !== numberIds.length) return json({ error: "Number not found" }, 404);
  const ownerId = numberRows[0].user_id;
  if (!(await canAccessUser(admin, requesterId, ownerId))) return json({ error: "Forbidden" }, 403);

  const { data: templateRows } = await admin
    .from("message_templates")
    .select("id, name, status, body, variables")
    .in("id", templateIds);
  if (!templateRows || templateRows.length !== templateIds.length) return json({ error: "Template not found" }, 404);

  const { data: backoffRows } = await admin
    .from("provider_backoff")
    .select("whatsapp_number_id, retry_after")
    .in("whatsapp_number_id", numberIds);
  const backoffMap = new Map<string, string>();
  for (const b of backoffRows ?? []) backoffMap.set(b.whatsapp_number_id, b.retry_after);

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Allocate audience round-robin (capped per-number).
  const allocByNum = new Map<string, number>();
  for (const nid of numberIds) allocByNum.set(nid, 0);
  let remaining = audienceCount;
  while (remaining > 0) {
    let placedThisRound = false;
    for (const nid of numberIds) {
      const cur = allocByNum.get(nid) ?? 0;
      const nrow: any = numberRows.find((n: any) => n.id === nid);
      const cap = Math.max(0, Math.min(perNumberQuota, Number(nrow?.daily_send_limit ?? 200)));
      if (cur < cap) {
        allocByNum.set(nid, cur + 1);
        remaining--;
        placedThisRound = true;
        if (remaining === 0) break;
      }
    }
    if (!placedThisRound) break;
  }
  if (remaining > 0) {
    warnings.push(`Capacity is ${audienceCount - remaining} but audience is ${audienceCount}. Add more numbers, raise per-number cap, or split.`);
  }

  const numbersOut = numberRows.map((n: any) => {
    const allocation = allocByNum.get(n.id) ?? 0;
    if (n.webhook_connected === false) blockers.push(`Number ${n.phone_number}: webhook not connected — replies would be lost.`);
    if (n.status === "banned" || n.status === "restricted") blockers.push(`Number ${n.phone_number} is ${n.status}.`);
    if (n.paused_at) blockers.push(`Number ${n.phone_number} is paused: ${n.paused_reason ?? "no reason"}.`);
    if (!n.provider_api_key) blockers.push(`Number ${n.phone_number}: no provider API key.`);
    if (allocation === 0) blockers.push(`Number ${n.phone_number} got zero allocation — remove it from the pool or raise its daily cap.`);
    return {
      id: n.id,
      phone: n.phone_number,
      status: n.status,
      webhook_connected: n.webhook_connected,
      allocation,
      daily_cap: Number(n.daily_send_limit ?? 200),
      backoff_until: backoffMap.get(n.id) ?? null,
    };
  });

  for (const t of templateRows) {
    if (t.status !== "approved") blockers.push(`Template "${t.name}" is ${t.status}, not approved.`);
  }

  // Global instant kill switch.
  if (dispatchMode === "marketing_instant") {
    const { data: flag } = await admin.from("system_flags").select("value").eq("key", "marketing_instant_enabled").maybeSingle();
    if (flag && flag.value === false) blockers.push("Marketing Instant mode is globally disabled (kill switch).");
  }

  const signature = await computeSnapshotSignature({
    numberIds, templateIds, audienceCount, windowStart, windowEnd,
    perNumberQuota, maxInflightPerNumber, maxInflightPerCampaign,
  });

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const report = {
    signature,
    expires_at: expiresAt,
    dispatch_mode: dispatchMode,
    numbers: numbersOut,
    templates: templateRows.map((t: any) => ({ id: t.id, name: t.name, status: t.status })),
    audience: { total: audienceCount, allocated: audienceCount - remaining },
    caps: {
      per_number_inflight: maxInflightPerNumber,
      per_campaign_inflight: maxInflightPerCampaign,
      per_number_daily: perNumberQuota,
    },
    window: { start: windowStart, end: windowEnd, per_recipient_tz: body.respect_recipient_tz !== false },
    blockers,
    warnings,
    notice: dispatchMode === "marketing_instant"
      ? "Instant mode sends each recipient immediately when their LOCAL window opens. Recipients in different timezones do not all send at the same global second."
      : null,
  };

  if (reuseCampaignId) {
    await admin.from("campaigns").update({
      prepared_at: new Date().toISOString(),
      prepared_expires_at: expiresAt,
      prepared_signature: signature,
      prepared_report: report,
    }).eq("id", reuseCampaignId);
  }

  return json({ ok: blockers.length === 0, signature, expires_at: expiresAt, blockers, warnings, snapshot: report });
}

// Engage / release a kill switch. scope: campaign | sender | instant_mode_global.
async function killSwitch(admin: any, requesterId: string, body: any) {
  const scope = String(body.scope || "campaign");
  const reason = String(body.reason || "manual").slice(0, 500);
  const release = body.release === true;

  if (scope === "campaign") {
    const id = String(body.campaign_id || "");
    if (!uuidRegex.test(id)) return json({ error: "campaign_id required" }, 400);
    const { data: c } = await admin.from("campaigns").select("id, user_id, workspace_id").eq("id", id).maybeSingle();
    if (!c) return json({ error: "Not found" }, 404);
    if (!(await canAccessUser(admin, requesterId, c.user_id))) return json({ error: "Forbidden" }, 403);
    await admin.from("campaigns").update({
      kill_switch_at: release ? null : new Date().toISOString(),
      kill_switch_by: release ? null : requesterId,
      kill_switch_reason: release ? null : reason,
      status: release ? "running" : "paused",
    }).eq("id", id);
    await admin.from("campaign_dispatch_events").insert({
      campaign_id: id, workspace_id: c.workspace_id,
      event_type: release ? "kill_switch_released" : "killed",
      reason, payload: { by: requesterId },
    });
    return json({ ok: true });
  }

  if (scope === "sender") {
    const id = String(body.whatsapp_number_id || "");
    if (!uuidRegex.test(id)) return json({ error: "whatsapp_number_id required" }, 400);
    const { data: n } = await admin.from("whatsapp_numbers").select("id, user_id").eq("id", id).maybeSingle();
    if (!n) return json({ error: "Not found" }, 404);
    if (!(await canAccessUser(admin, requesterId, n.user_id))) return json({ error: "Forbidden" }, 403);
    await admin.from("whatsapp_numbers").update({
      paused_at: release ? null : new Date().toISOString(),
      paused_reason: release ? null : reason,
    }).eq("id", id);
    return json({ ok: true });
  }

  if (scope === "instant_mode_global") {
    const { data: isAdminRow } = await admin.rpc("is_admin", { _user_id: requesterId });
    if (!isAdminRow) return json({ error: "Admin only" }, 403);
    await admin.from("system_flags").upsert({
      key: "marketing_instant_enabled",
      value: release ? true : false,
      updated_by: requesterId,
      updated_at: new Date().toISOString(),
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown scope" }, 400);
}

// Live runtime status for the operator UI.
async function runtimeStatus(admin: any, requesterId: string, body: any) {
  const id = String(body.campaign_id || "");
  if (!uuidRegex.test(id)) return json({ error: "campaign_id required" }, 400);
  const { data: c } = await admin.from("campaigns")
    .select("id, user_id, workspace_id, status, dispatch_mode, kill_switch_at, kill_switch_reason, prepared_at, prepared_expires_at, prepared_signature, prepared_report, max_inflight_per_number, max_inflight_per_campaign")
    .eq("id", id).maybeSingle();
  if (!c) return json({ error: "Not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, c.user_id))) return json({ error: "Forbidden" }, 403);

  const sinceIso = new Date(Date.now() - 60_000).toISOString();
  const fiveMinIso = new Date(Date.now() - 5 * 60_000).toISOString();

  const { data: recents } = await admin
    .from("campaign_recipients")
    .select("whatsapp_number_id, status, sent_at")
    .eq("campaign_id", id)
    .gte("sent_at", sinceIso)
    .not("sent_at", "is", null)
    .limit(2000);
  const sentLast60 = (recents ?? []).length;
  const activeSenders = new Set((recents ?? []).map((r: any) => r.whatsapp_number_id).filter(Boolean));

  const { data: events } = await admin
    .from("campaign_dispatch_events")
    .select("whatsapp_number_id, event_type, reason, created_at")
    .eq("campaign_id", id)
    .gte("created_at", fiveMinIso)
    .order("created_at", { ascending: false })
    .limit(500);

  const idleByNum = new Map<string, { reason: string; at: string }>();
  for (const e of events ?? []) {
    const nid = (e as any).whatsapp_number_id;
    if (!nid || idleByNum.has(nid) || activeSenders.has(nid)) continue;
    idleByNum.set(nid, { reason: e.reason ?? e.event_type, at: e.created_at });
  }

  // Pool participation alert: window open + < 50% selected senders sent in last 5 min.
  const selected = (c.prepared_report as any)?.numbers?.map((n: any) => n.id) ?? [];
  const { data: recentByNum } = await admin
    .from("campaign_recipients")
    .select("whatsapp_number_id")
    .eq("campaign_id", id)
    .gte("sent_at", fiveMinIso)
    .not("sent_at", "is", null)
    .limit(5000);
  const activeRecent = new Set((recentByNum ?? []).map((r: any) => r.whatsapp_number_id));
  const idle = selected.filter((n: string) => !activeRecent.has(n));
  const poolAlert = c.status === "running" && selected.length > 0 && activeRecent.size * 2 < selected.length;

  return json({
    ok: true,
    campaign: {
      id: c.id,
      status: c.status,
      dispatch_mode: c.dispatch_mode,
      kill_switch: c.kill_switch_at ? { at: c.kill_switch_at, reason: c.kill_switch_reason } : null,
      snapshot: c.prepared_at
        ? { prepared_at: c.prepared_at, expires_at: c.prepared_expires_at, signature: c.prepared_signature, fresh: new Date(c.prepared_expires_at).getTime() > Date.now() }
        : null,
      caps: { per_number: c.max_inflight_per_number, per_campaign: c.max_inflight_per_campaign },
    },
    runtime: {
      sent_last_60s: sentLast60,
      rate_per_min: sentLast60,
      active_senders: [...activeSenders],
      idle_senders: [...idleByNum.entries()].map(([id, v]) => ({ id, reason: v.reason, at: v.at })),
      pool_participation_alert: poolAlert,
      idle_pool_members: idle,
    },
  });
}
