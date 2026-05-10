// Polls the connected Gmail mailbox (iskra.gupshup.alerts@gmail.com) for new
// notifications from Gupshup, classifies them with a strict allowlist, links
// them to a whatsapp_number when possible, and enqueues a Slack alert.
//
// Triggered by pg_cron every 5 minutes. Idempotent on Gmail message id.
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
  | "number_approved" | "display_name_approved" | "display_name_rejected"
  | "waba_restricted" | "waba_blocked" | "quality_changed" | "tier_upgraded"
  | "waba_status_other" | "template_approved" | "template_rejected"
  | "billing" | "other" | "dropped";

type Routing = "numbers" | "finance";

interface Classification {
  category: Category;
  severity: Severity;
  routing: Routing;
  send: boolean;
  secondary?: string;
}

function authHeaders() {
  return {
    "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GMAIL_KEY,
  };
}

// Subjects we never want to be paged about.
const DROP_SUBJECT = /(verification|verified|welcome|getting started|onboarding|otp|one[- ]?time|password|webinar|newsletter|how to|invite|sign[- ]?in|signup link|confirm your email|please confirm|email confirmation)/i;

function pickQuality(text: string): string | null {
  // "Quality rating: Low/Medium/High" or "quality has changed to <X>"
  const m = text.match(/quality\s+(?:rating|status|is|has\s+(?:changed|moved)\s+to)[^a-z]{0,8}(low|medium|high|red|yellow|green|flagged)/i)
       || text.match(/(?:to|is|now)\s+(low|medium|high)\s+quality/i);
  return m ? m[1].toLowerCase() : null;
}
function pickTier(text: string): string | null {
  const m = text.match(/(?:tier|messaging\s+limit)[^a-z0-9]{0,8}(tier_?\d|\d{2,3}\s*k|unlimited|1k|10k|100k|1000)/i);
  return m ? m[1] : null;
}
function pickReason(text: string): string | null {
  const m = text.match(/(restricted[^.\n]{0,120}|flagged[^.\n]{0,120}|policy[^.\n]{0,120}|messaging limit[^.\n]{0,120})/i);
  return m ? m[1].trim().slice(0, 120) : null;
}
function pickDisplayName(subject: string, text: string): string | null {
  const m = text.match(/display\s+name[^a-z0-9"']{0,8}["']([^"'\n]{2,80})["']/i)
       || subject.match(/\|\s*([A-Za-z0-9_]{3,40})\s*$/);
  return m ? m[1].trim() : null;
}
function pickTemplate(text: string): string | null {
  const m = text.match(/template[^a-z0-9]{0,8}["']?([a-z0-9_\-]{3,80})["']?/i);
  return m ? m[1] : null;
}
function pickAmount(text: string): string | null {
  const m = text.match(/(?:USD|INR|EUR|AED|\$|₹|€)\s?([\d,]+(?:\.\d{1,2})?)/i)
       || text.match(/amount[^a-z0-9]{0,4}([\d,]+(?:\.\d{1,2})?)/i);
  return m ? m[1] : null;
}

function classify(subject: string, body: string): Classification {
  const sub = subject || "";
  const txt = `${subject}\n${body}`;
  const t = txt.toLowerCase();

  // 1. Hard drop verification / onboarding noise.
  if (DROP_SUBJECT.test(sub)) {
    return { category: "dropped", severity: "info", routing: "numbers", send: false };
  }

  // 2. Billing / payments → finance.
  if (/(recharge\s+successful|payment\s+(received|successful)|invoice|low\s+balance|wallet|funds\s+added|recharge\s+failed)/i.test(sub)) {
    const failed = /(failed|declined|insufficient)/i.test(sub + " " + body);
    return {
      category: "billing",
      severity: failed ? "warning" : "info",
      routing: "finance",
      send: true,
      secondary: pickAmount(txt) || (failed ? "Failed" : "Recharge"),
    };
  }

  // 3. Number / Display name approvals.
  if (/phone\s+number\s+and\s+display\s+name\s+approved/i.test(sub)) {
    return { category: "number_approved", severity: "info", routing: "numbers", send: true, secondary: "Approved" };
  }
  if (/display\s+name\s+approved/i.test(sub)) {
    const name = pickDisplayName(sub, body);
    return { category: "display_name_approved", severity: "info", routing: "numbers", send: true, secondary: name ? `Name: ${name}` : "Approved" };
  }
  if (/display\s+name\s+rejected/i.test(sub)) {
    const name = pickDisplayName(sub, body);
    return { category: "display_name_rejected", severity: "warning", routing: "numbers", send: true, secondary: name ? `Name: ${name}` : "Rejected" };
  }

  // 4. Templates.
  if (/template[^|]*\b(approved|live)\b/i.test(sub)) {
    const name = pickTemplate(txt);
    return { category: "template_approved", severity: "info", routing: "numbers", send: true, secondary: name ? `Template: ${name}` : "Approved" };
  }
  if (/template[^|]*\b(rejected|paused|disabled|flagged)\b/i.test(sub)) {
    const name = pickTemplate(txt);
    return { category: "template_rejected", severity: "warning", routing: "numbers", send: true, secondary: name ? `Template: ${name}` : "Rejected" };
  }

  // 5. WABA status updates - the catch-all umbrella from Gupshup.
  if (/update\s+in\s+your\s+waba\s+status/i.test(sub) || /waba\s+status/i.test(sub)) {
    if (/(banned|disabled|terminated|suspended|blocked)/i.test(t)) {
      return { category: "waba_blocked", severity: "critical", routing: "numbers", send: true, secondary: pickReason(txt) || "Blocked" };
    }
    if (/(restrict|flagged|messaging\s+limit\s+(reduced|downgraded))/i.test(t)) {
      return { category: "waba_restricted", severity: "critical", routing: "numbers", send: true, secondary: pickReason(txt) || "Restricted" };
    }
    const q = pickQuality(t);
    if (q) {
      return { category: "quality_changed", severity: "warning", routing: "numbers", send: true, secondary: `Quality: ${q}` };
    }
    if (/(tier\s+upgrade|messaging\s+limit\s+(increased|upgraded))/i.test(t)) {
      const tier = pickTier(t);
      return { category: "tier_upgraded", severity: "info", routing: "numbers", send: true, secondary: tier ? `Tier: ${tier}` : "Upgraded" };
    }
    return { category: "waba_status_other", severity: "warning", routing: "numbers", send: true, secondary: "Status update" };
  }

  // 6. Standalone tier upgrade emails.
  if (/(tier\s+upgrade|messaging\s+limit\s+(increased|upgraded))/i.test(sub)) {
    const tier = pickTier(txt);
    return { category: "tier_upgraded", severity: "info", routing: "numbers", send: true, secondary: tier ? `Tier: ${tier}` : "Upgraded" };
  }

  // 7. Everything else: log only, don't page.
  return { category: "other", severity: "info", routing: "numbers", send: false };
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
  const matches = text.match(/\+?\d[\d \-()]{9,18}\d/g);
  if (!matches) return null;
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }
  return null;
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

  const { data: state } = await supabase.from("gupshup_mail_state").select("*").eq("id", 1).maybeSingle();
  const lastMs = Number(state?.last_internal_date_ms || 0);
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

  let scanned = 0; let inserted = 0; let alerts = 0; let dropped = 0;
  let maxInternal = lastMs;

  for (const id of ids) {
    scanned++;
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

    if (!/gupshup\.(io|com)/i.test(from)) continue;

    const bodyText = extractText(msg.payload || {});
    const snippet = String(msg.snippet || "").slice(0, 500);
    const cls = classify(subject, bodyText || snippet);
    const phone = parsePhone(`${subject}\n${bodyText}`);
    const wabaId = parseWabaId(`${subject}\n${bodyText}`);

    let whatsappNumberId: string | null = null;
    let workspaceId: string | null = null;
    if (phone) {
      const { data: num } = await supabase
        .from("whatsapp_numbers").select("id, workspace_id").eq("phone_number", phone).maybeSingle();
      if (num) { whatsappNumberId = num.id; workspaceId = num.workspace_id; }
    }

    const parsed = {
      phone_number: phone, waba_id: wabaId, from,
      secondary_field: cls.secondary || null,
      routing: cls.routing,
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
        category: cls.category,
        severity: cls.severity,
        whatsapp_number_id: whatsappNumberId,
        workspace_id: workspaceId,
        parsed,
      })
      .select("id")
      .maybeSingle();
    if (insErr) {
      if (!String(insErr.message).includes("duplicate")) console.warn("log insert failed", insErr.message);
      continue;
    }
    inserted++;

    if (!cls.send) { dropped++; continue; }

    const { data: ev, error: evErr } = await supabase
      .from("slack_event_queue")
      .insert({
        event_type: "gupshup_mail_alert",
        workspace_id: workspaceId,
        payload: {
          category: cls.category,
          severity: cls.severity,
          routing: cls.routing,
          secondary: cls.secondary || null,
          phone_number: phone,
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

  return new Response(JSON.stringify({ scanned, inserted, alerts, dropped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
