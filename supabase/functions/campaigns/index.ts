import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function normalizePhone(phone: string) {
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
  const whatsappNumberId = String(body.whatsapp_number_id || "");
  const templateId = String(body.template_id || "");
  const minDelay = Math.max(0, Math.min(86400, Number(body.delay_min_seconds ?? 30)));
  const maxDelay = Math.max(minDelay, Math.min(86400, Number(body.delay_max_seconds ?? 90)));
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

  // New scheduling params
  const schedulerKind: "uniform" | "poisson" = body.scheduler_kind === "uniform" ? "uniform" : "poisson";
  const scheduledDates: string[] = Array.isArray(body.scheduled_dates) ? body.scheduled_dates.filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  const windowStart: string = typeof body.window_start === "string" && /^\d{2}:\d{2}$/.test(body.window_start) ? body.window_start : "09:00";
  const windowEnd: string = typeof body.window_end === "string" && /^\d{2}:\d{2}$/.test(body.window_end) ? body.window_end : "18:00";
  const respectTz: boolean = body.respect_recipient_tz !== false;
  const bucketIndex: number = Math.max(0, Number(body.bucket_index ?? 0) | 0);
  const bucketCount: number = Math.max(1, Number(body.bucket_count ?? 1) | 0);
  const pipelineId: string | null = typeof body.pipeline_id === "string" && uuidRegex.test(body.pipeline_id) ? body.pipeline_id : null;

  if (!name || !uuidRegex.test(whatsappNumberId) || !uuidRegex.test(templateId)) {
    return json({ error: "Campaign name, number, and template are required" }, 400);
  }
  if (recipients.length < 1 || recipients.length > 1000) {
    return json({ error: "Add 1-1000 recipients" }, 400);
  }

  const { data: number } = await admin
    .from("whatsapp_numbers")
    .select("id, user_id, workspace_id, phone_number, provider_app_id")
    .eq("id", whatsappNumberId)
    .maybeSingle();
  if (!number) return json({ error: "WhatsApp number not found" }, 404);
  if (!(await canAccessUser(admin, requesterId, number.user_id))) return json({ error: "Forbidden" }, 403);

  const { data: template } = await admin
    .from("message_templates")
    .select("id, user_id, name, language, variables, provider_template_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!template || template.user_id !== number.user_id) return json({ error: "Template not found" }, 404);

  const cleanRecipients = recipients
    .map((r: any) => ({
      contact_phone: normalizePhone(r.phone || r.contact_phone),
      contact_name: String(r.name || r.contact_name || "").trim().slice(0, 160) || null,
      variables: typeof r.variables === "object" && r.variables ? r.variables : {},
      conversation_id: typeof r.conversation_id === "string" && uuidRegex.test(r.conversation_id) ? r.conversation_id : null,
    }))
    .filter((r: any) => r.contact_phone.length >= 8 && r.contact_phone.length <= 18);

  if (cleanRecipients.length === 0) return json({ error: "No valid phone numbers" }, 400);

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .insert({
      user_id: number.user_id,
      workspace_id: number.workspace_id,
      whatsapp_number_id: number.id,
      template_id: template.id,
      name,
      status: "running",
      delay_min_seconds: minDelay,
      delay_max_seconds: maxDelay,
      total_recipients: cleanRecipients.length,
      scheduled_start_at: new Date().toISOString(),
      schedule_window_start: windowStart + ":00",
      schedule_window_end: windowEnd + ":00",
      respect_recipient_tz: respectTz,
      scheduled_dates: scheduledDates,
      pipeline_id: pipelineId,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) return json({ error: campaignError?.message || "Failed to create campaign" }, 500);

  // ------- Compute scheduled_at per recipient -------
  const wsMin = hhmmToMin(windowStart);
  const wsMax = hhmmToMin(windowEnd);
  const windowSeconds = Math.max(60, (wsMax - wsMin) * 60);
  const avgDelay = Math.max(1, (minDelay + maxDelay) / 2);
  // Cross-number stagger: shift this bucket's first send by index * (avgDelay / bucketCount)
  const bucketShiftSec = bucketCount > 1 ? Math.floor((avgDelay / bucketCount) * bucketIndex) : 0;

  const rows: any[] = [];

  if (scheduledDates.length === 0) {
    // Send-now path: respect [windowStart, windowEnd] in each recipient's TZ.
    // If a send would land after windowEnd, roll cursor to next day's windowStart.
    const nowMs = Date.now();
    const startMs0 = nowMs + 5_000 + bucketShiftSec * 1000;
    // Group by recipient TZ to keep per-TZ cursor independent
    const perTz = new Map<string, typeof cleanRecipients>();
    for (const r of cleanRecipients) {
      const tz = respectTz ? tzFromPhone(r.contact_phone) : "UTC";
      if (!perTz.has(tz)) perTz.set(tz, []);
      perTz.get(tz)!.push(r);
    }
    const dayKey = (ms: number, tz: string) => {
      try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms)); }
      catch { return new Date(ms).toISOString().slice(0, 10); }
    };
    for (const [tz, list] of perTz) {
      let cursorMs = startMs0;
      // If we're past windowEnd today, jump to tomorrow's windowStart
      const ensureInsideWindow = () => {
        const today = dayKey(cursorMs, tz);
        const todayStart = dateAtTzToUTC(today, windowStart, tz).getTime();
        const todayEnd = dateAtTzToUTC(today, windowEnd, tz).getTime();
        if (cursorMs < todayStart) cursorMs = todayStart;
        if (cursorMs >= todayEnd) {
          // jump to next day windowStart
          const next = new Date(cursorMs + 24 * 3600_000);
          const nextDate = dayKey(next.getTime(), tz);
          cursorMs = dateAtTzToUTC(nextDate, windowStart, tz).getTime();
        }
      };
      ensureInsideWindow();
      for (const r of list) {
        let gapSec: number;
        if (schedulerKind === "poisson") {
          gapSec = exponentialGap(1 / avgDelay);
          gapSec = Math.max(minDelay, Math.min(Math.max(minDelay + 1, maxDelay * 3), gapSec));
        } else {
          gapSec = randomDelay(minDelay, maxDelay);
        }
        cursorMs += gapSec * 1000;
        ensureInsideWindow();
        rows.push({
          ...r,
          user_id: number.user_id,
          workspace_id: number.workspace_id,
          campaign_id: campaign.id,
          status: "scheduled",
          scheduled_at: new Date(cursorMs).toISOString(),
        });
      }
    }
    rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  } else {
    // Multi-day path: split recipients evenly across dates, schedule inside window
    const perDay = Math.ceil(cleanRecipients.length / scheduledDates.length);
    for (let di = 0; di < scheduledDates.length; di++) {
      const date = scheduledDates[di];
      const slice = cleanRecipients.slice(di * perDay, (di + 1) * perDay);
      if (slice.length === 0) continue;
      // Per-recipient schedule: recipient TZ if respectTz, else workspace TZ (UTC fallback)
      // Build per-recipient slot inside [windowStart, windowEnd] with poisson spacing
      // Sort by tz so same-tz recipients get sequential slots; we still randomize inside.
      const perTz = new Map<string, typeof slice>();
      for (const r of slice) {
        const tz = respectTz ? tzFromPhone(r.contact_phone) : "UTC";
        if (!perTz.has(tz)) perTz.set(tz, []);
        perTz.get(tz)!.push(r);
      }
      for (const [tz, list] of perTz) {
        const startUtc = dateAtTzToUTC(date, windowStart, tz).getTime() + bucketShiftSec * 1000;
        const endUtc = dateAtTzToUTC(date, windowEnd, tz).getTime();
        const span = Math.max(60_000, endUtc - startUtc);
        if (schedulerKind === "poisson") {
          // exponential gaps with rate so expected total ≈ span
          const rate = list.length / (span / 1000);
          let cursor = startUtc;
          for (const r of list) {
            cursor += exponentialGap(rate) * 1000;
            if (cursor > endUtc) cursor = endUtc - Math.floor(Math.random() * 60_000); // clamp
            rows.push({
              ...r,
              user_id: number.user_id, workspace_id: number.workspace_id,
              campaign_id: campaign.id, status: "scheduled",
              scheduled_at: new Date(cursor).toISOString(),
            });
          }
        } else {
          // Uniform: evenly distributed slots + jitter
          const step = span / Math.max(1, list.length);
          for (let i = 0; i < list.length; i++) {
            const jitter = (Math.random() - 0.5) * step * 0.4;
            const ts = startUtc + i * step + jitter;
            rows.push({
              ...list[i],
              user_id: number.user_id, workspace_id: number.workspace_id,
              campaign_id: campaign.id, status: "scheduled",
              scheduled_at: new Date(Math.min(endUtc, Math.max(startUtc, ts))).toISOString(),
            });
          }
        }
      }
    }
    // Sort by scheduled_at to keep DB insert tidy
    rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }

  const { error: recipientsError } = await admin.from("campaign_recipients").insert(rows);
  if (recipientsError) return json({ error: recipientsError.message }, 500);

  let immediate: any = null;
  if (scheduledDates.length === 0 && minDelay === 0 && maxDelay === 0) {
    await admin.from("campaign_recipients")
      .update({ scheduled_at: new Date(Date.now() - 1000).toISOString() })
      .eq("campaign_id", campaign.id);
    try {
      const res = await processQueue(admin);
      immediate = await res.json();
    } catch (err) {
      immediate = { error: err instanceof Error ? err.message : "process failed" };
    }
  }

  // Slack notification handled by DB trigger on campaigns.status change.
  return json({ ok: true, campaign_id: campaign.id, scheduled: rows.length, immediate });
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
          synced_at: new Date().toISOString(),
        },
        { onConflict: "whatsapp_number_id,name,language" },
      );
    if (!upsertError) upserted++;
  }
  return json({ ok: true, fetched: templates.length, upserted, warning: syncWarning });
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

  const variableNames = Array.isArray(template.variables) ? template.variables : [];
  const params = variableNames.map((key: string) => String(recipient.variables?.[key] ?? ""));
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

function renderTemplateBody(body: string | null | undefined, variableNames: string[], values: Record<string, unknown> | undefined | null): string {
  if (!body) return "";
  let out = String(body);
  // Positional {{1}}, {{2}}, ... mapped to variableNames order
  variableNames.forEach((name, idx) => {
    const v = String((values ?? {})[name] ?? "");
    out = out.replaceAll(`{{${idx + 1}}}`, v);
    out = out.replaceAll(`{${name}}`, v);
    out = out.replaceAll(`{{${name}}}`, v);
  });
  return out;
}

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
  // Scale the per-tick batch with the number of active ready numbers so utility
  // throughput is not bottlenecked by a fixed ceiling when multiple numbers are live.
  // Floor 50 (single-number safe), 20 recipients per active number, hard cap 500.
  let perTickLimit = 200;
  try {
    // Count both 'active' and 'ready' numbers (matches lead-dispatch sender filter).
    // Previously only counted 'ready', which capped throughput at 50/min once
    // numbers transitioned to 'active' status.
    const { count: activeNumbers } = await admin
      .from("whatsapp_numbers")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "ready"])
      .eq("is_active", true);
    const n = activeNumbers ?? 0;
    perTickLimit = Math.min(500, Math.max(50, n * 20));
  } catch (_) {
    perTickLimit = 200;
  }

  // Look ahead window: pg_cron fires at minute boundaries, so fetch anything
  // due within the next ~55s and pace sends inside the tick. This honors the
  // configured min/max delay (which is randomized into scheduled_at) instead of
  // collapsing every send to xx:01 (the cron tick).
  const TICK_BUDGET_MS = 55_000;
  const tickStartedAt = Date.now();
  const horizonIso = new Date(tickStartedAt + TICK_BUDGET_MS).toISOString();

  const { data: due, error } = await admin
    .from("campaign_recipients")
    .select("id, user_id, workspace_id, campaign_id, conversation_id, contact_phone, contact_name, variables, scheduled_at, campaigns!inner(id, status, pipeline_id, whatsapp_number_id, whatsapp_numbers(phone_number, provider_app_id, provider_api_key, display_name), message_templates(id, name, language, body, variables, provider_template_id))")
    .eq("status", "scheduled")
    .lte("scheduled_at", horizonIso)
    .eq("campaigns.status", "running")
    .order("scheduled_at", { ascending: true })
    .limit(perTickLimit);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const recipient of due ?? []) {
    // Honor the per-recipient scheduled_at: sleep up to the tick budget so
    // sent_at lands at the actual randomized timestamp (preserves jitter
    // configured via delay_min/max_seconds), not the cron minute boundary.
    const targetMs = new Date(recipient.scheduled_at).getTime();
    const nowMs = Date.now();
    const waitMs = targetMs - nowMs;
    const remainingBudget = TICK_BUDGET_MS - (nowMs - tickStartedAt);
    if (waitMs > 0 && remainingBudget > 0) {
      await new Promise((r) => setTimeout(r, Math.min(waitMs, remainingBudget)));
    }
    if (Date.now() - tickStartedAt > TICK_BUDGET_MS) break;

    const { data: locked } = await admin
      .from("campaign_recipients")
      .update({ status: "sending" })
      .eq("id", recipient.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!locked) continue;

    try {
      const gsBody = await sendTemplate(admin, recipient);
      const providerId = gsBody.messageId || null;
      const tpl = recipient.campaigns?.message_templates;
      const variableNames: string[] = Array.isArray(tpl?.variables) ? tpl.variables : [];
      const renderedBody = renderTemplateBody(tpl?.body, variableNames, recipient.variables) || `[Template] ${tpl?.name ?? ""}`.trim();
      const sentAt = new Date().toISOString();

      // Ensure a conversation exists so Inbox shows the thread starting from this opener
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
      sent++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "Send failed";
      await admin.from("campaign_recipients").update({ status: "failed", error_message: msg }).eq("id", recipient.id);
    }
  }

  const campaignIds = [...new Set((due ?? []).map((r: any) => r.campaign_id))];
  for (const id of campaignIds) {
    const [{ count: sentCount }, { count: failedCount }, { count: pendingCount }] = await Promise.all([
      admin.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "sent"),
      admin.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "failed"),
      admin.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).in("status", ["pending", "scheduled", "sending"]),
    ]);
    await admin.from("campaigns").update({
      sent_count: sentCount ?? 0,
      failed_count: failedCount ?? 0,
      status: pendingCount === 0 ? "completed" : "running",
    }).eq("id", id);
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

  return json({ ok: true, summary, results: flat });
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
      return await processQueue(admin);
    }

    const auth = await getUser(req, supabaseUrl, anonKey);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    if (action === "launch") return await launchCampaign(admin, auth.user.id, body);
    if (action === "blast") return await blastCampaign(admin, auth.user.id, body);
    if (action === "upsert_template") return await upsertTemplate(admin, auth.user.id, body);
    if (action === "sync_templates") return await syncTemplates(admin, auth.user.id, body);
    if (action === "sync_templates_all") return await syncTemplatesAll(admin, auth.user.id, body);
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("campaigns error", msg);
    return json({ error: msg }, 500);
  }
});
