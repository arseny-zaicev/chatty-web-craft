// Polls the connected Gmail mailbox (iskra.gupshup.alerts@gmail.com) for new
// notifications from Gupshup, classifies them, links them to a whatsapp_number
// when possible, and enqueues a Slack alert in slack_event_queue.
//
// Triggered by pg_cron every 5 minutes. Idempotent: each Gmail message id is
// stored in public.gupshup_mail_log with a UNIQUE constraint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const GMAIL_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY") || "";

type Severity = "info" | "warning" | "critical";
type Category =
  | "quality_drop" | "restriction" | "block" | "template_rejected"
  | "template_approved" | "billing" | "account_review" | "other";

const CRITICAL: Set<Category> = new Set(["block", "restriction", "billing"]);
const WARNING: Set<Category> = new Set(["quality_drop", "template_rejected", "account_review"]);

function authHeaders() {
  return {
    "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GMAIL_KEY,
  };
}

function classify(subject: string, body: string): { category: Category; severity: Severity } {
  const t = `${subject}\n${body}`.toLowerCase();
  let category: Category = "other";
  if (/template.*(rejected|paused|disabled)/.test(t))           category = "template_rejected";
  else if (/template.*(approved|live)/.test(t))                 category = "template_approved";
  else if (/(blocked|disabled|banned|terminated|suspend)/.test(t)) category = "block";
  else if (/(restrict|throttl|messaging.?limit|tier.?demot)/.test(t)) category = "restriction";
  else if (/(quality).*(low|medium|high|drop|update|degrad)/.test(t) || /quality.?rating/.test(t)) category = "quality_drop";
  else if (/(payment|invoice|low.?balance|funds|recharge|wallet)/.test(t)) category = "billing";
  else if (/(policy review|account review|under review|verification)/.test(t)) category = "account_review";

  const severity: Severity = CRITICAL.has(category) ? "critical" : WARNING.has(category) ? "warning" : "info";
  return { category, severity };
}

function decodeBase64Url(s: string): string {
  try {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
    return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch { return ""; }
}

type GmailPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: GmailPart[] };

function extractText(payload: GmailPart): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    // Prefer text/plain
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) return decodeBase64Url(p.body.data);
    }
    for (const p of payload.parts) {
      const t = extractText(p);
      if (t) return t;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

function parsePhone(text: string): string | null {
  // Find sequences of 10–15 digits, optionally prefixed with +. Strip non-digits.
  const matches = text.match(/\+?\d[\d \-()]{9,18}\d/g);
  if (!matches) return null;
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }
  return null;
}

function parseTemplateName(text: string): string | null {
  const m = text.match(/template[^\n]*?["“']([a-z0-9_\-]{3,80})["”']/i)
        || text.match(/template[^\n]*?(?:name|id)[:\s-]+([a-z0-9_\-]{3,80})/i);
  return m ? m[1] : null;
}

function parseWabaId(text: string): string | null {
  const m = text.match(/(?:waba|whatsapp business account)[^\n]*?(\d{10,20})/i);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!LOVABLE_API_KEY || !GMAIL_KEY) {
    return new Response(JSON.stringify({ error: "Gmail connector not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Cursor: only look at messages newer than the last seen internalDate.
  const { data: state } = await supabase.from("gupshup_mail_state").select("*").eq("id", 1).maybeSingle();
  const lastMs = Number(state?.last_internal_date_ms || 0);
  // First run: limit to last 7 days.
  const sinceSec = Math.floor((lastMs > 0 ? lastMs : Date.now() - 7 * 24 * 3600 * 1000) / 1000);
  const q = encodeURIComponent(`(from:gupshup.io OR from:gupshup.com) after:${sinceSec}`);
  const listUrl = `${GATEWAY}/users/me/messages?maxResults=50&q=${q}`;

  const listRes = await fetch(listUrl, { headers: authHeaders() });
  if (!listRes.ok) {
    const txt = await listRes.text();
    await supabase.from("gupshup_mail_state").update({
      last_run_at: new Date().toISOString(),
      last_error: `list ${listRes.status}: ${txt.slice(0, 500)}`,
    }).eq("id", 1);
    return new Response(JSON.stringify({ error: `Gmail list failed [${listRes.status}]`, body: txt }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const listJson = await listRes.json();
  const ids: string[] = (listJson.messages || []).map((m: { id: string }) => m.id);

  let scanned = 0; let inserted = 0; let alerts = 0;
  let maxInternal = lastMs;

  for (const id of ids) {
    scanned++;

    // Skip if already processed (cheap check).
    const { data: existing } = await supabase
      .from("gupshup_mail_log").select("id").eq("gmail_id", id).maybeSingle();
    if (existing) continue;

    const msgRes = await fetch(`${GATEWAY}/users/me/messages/${id}?format=full`, { headers: authHeaders() });
    if (!msgRes.ok) { console.warn(`get ${id} failed`, msgRes.status); continue; }
    const msg = await msgRes.json();

    const internalDate = Number(msg.internalDate || 0);
    if (internalDate > maxInternal) maxInternal = internalDate;

    const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
    const headerVal = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value || "";
    const from = headerVal("From");
    const subject = headerVal("Subject");

    // Defence: ignore mail not actually from gupshup
    if (!/gupshup\.(io|com)/i.test(from)) continue;

    const bodyText = extractText(msg.payload || {});
    const snippet = String(msg.snippet || "").slice(0, 500);
    const { category, severity } = classify(subject, bodyText || snippet);
    const phone = parsePhone(`${subject}\n${bodyText}`);
    const templateName = parseTemplateName(`${subject}\n${bodyText}`);
    const wabaId = parseWabaId(`${subject}\n${bodyText}`);

    let whatsappNumberId: string | null = null;
    let workspaceId: string | null = null;
    if (phone) {
      const { data: num } = await supabase
        .from("whatsapp_numbers").select("id, workspace_id").eq("phone_number", phone).maybeSingle();
      if (num) { whatsappNumberId = num.id; workspaceId = num.workspace_id; }
    }

    const parsed = {
      phone_number: phone, template_name: templateName, waba_id: wabaId, from,
    };

    const { data: ins, error: insErr } = await supabase
      .from("gupshup_mail_log")
      .insert({
        gmail_id: id,
        thread_id: msg.threadId || null,
        received_at: new Date(internalDate || Date.now()).toISOString(),
        from_address: from,
        subject,
        snippet,
        category,
        severity,
        whatsapp_number_id: whatsappNumberId,
        workspace_id: workspaceId,
        parsed,
      })
      .select("id")
      .maybeSingle();
    if (insErr) {
      // Probably a unique-violation race; ignore.
      if (!String(insErr.message).includes("duplicate")) console.warn("log insert failed", insErr.message);
      continue;
    }
    inserted++;

    // Enqueue Slack alert for non-info severity (info = noise).
    if (severity === "info") continue;

    const { data: ev, error: evErr } = await supabase
      .from("slack_event_queue")
      .insert({
        event_type: "gupshup_mail_alert",
        workspace_id: workspaceId,
        payload: {
          category, severity,
          phone_number: phone,
          template_name: templateName,
          waba_id: wabaId,
          subject, snippet, gmail_id: id,
          whatsapp_number_id: whatsappNumberId,
        },
      })
      .select("id")
      .maybeSingle();
    if (evErr) { console.warn("queue insert failed", evErr.message); continue; }
    alerts++;
    if (ev?.id && ins?.id) {
      await supabase.from("gupshup_mail_log").update({ slack_event_id: ev.id }).eq("id", ins.id);
    }
  }

  await supabase.from("gupshup_mail_state").update({
    last_internal_date_ms: maxInternal,
    last_run_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", 1);

  return new Response(JSON.stringify({ scanned, inserted, alerts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
