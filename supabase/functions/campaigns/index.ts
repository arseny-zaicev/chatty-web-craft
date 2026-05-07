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

async function launchCampaign(admin: any, requesterId: string, body: any) {
  const name = String(body.name || "").trim().slice(0, 160);
  const whatsappNumberId = String(body.whatsapp_number_id || "");
  const templateId = String(body.template_id || "");
  const minDelay = Math.max(5, Math.min(86400, Number(body.delay_min_seconds || 30)));
  const maxDelay = Math.max(minDelay, Math.min(86400, Number(body.delay_max_seconds || 90)));
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

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
    })
    .select("id")
    .single();
  if (campaignError || !campaign) return json({ error: campaignError?.message || "Failed to create campaign" }, 500);

  let cursor = Date.now() + 5000;
  const rows = cleanRecipients.map((r: any) => {
    cursor += randomDelay(minDelay, maxDelay) * 1000;
    return {
      ...r,
      user_id: number.user_id,
      workspace_id: number.workspace_id,
      campaign_id: campaign.id,
      status: "scheduled",
      scheduled_at: new Date(cursor).toISOString(),
    };
  });

  const { error: recipientsError } = await admin.from("campaign_recipients").insert(rows);
  if (recipientsError) return json({ error: recipientsError.message }, 500);
  return json({ ok: true, campaign_id: campaign.id, scheduled: rows.length });
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

  const res = await fetch(`https://api.gupshup.io/wa/app/${appId}/template`, {
    headers: { apikey: apiKey, accept: "application/json" },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: `Gupshup error: ${JSON.stringify(payload).slice(0, 400)}` }, 502);

  const templates: any[] = Array.isArray(payload.templates) ? payload.templates : [];
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
        { onConflict: "user_id,name,language" },
      );
    if (!upsertError) upserted++;
  }
  return json({ ok: true, fetched: templates.length, upserted });
}

async function sendTemplate(admin: any, recipient: any) {
  const campaign = recipient.campaigns;
  const template = campaign?.message_templates;
  const number = campaign?.whatsapp_numbers;
  if (!campaign || !template || !number) throw new Error("Missing campaign data");

  const apiKey = Deno.env.get("GUPSHUP_API_KEY");
  if (!apiKey) throw new Error("GUPSHUP_API_KEY not configured");

  const variableNames = Array.isArray(template.variables) ? template.variables : [];
  const params = variableNames.map((key: string) => String(recipient.variables?.[key] ?? ""));
  const form = new URLSearchParams();
  form.set("channel", "whatsapp");
  form.set("source", number.phone_number);
  form.set("destination", recipient.contact_phone);
  form.set(
    "message",
    JSON.stringify({
      type: "template",
      template: { id: template.provider_template_id || template.name, params },
    }),
  );
  if (number.provider_app_id) form.set("src.name", number.provider_app_id);

  const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.status === "error") throw new Error(JSON.stringify(payload).slice(0, 500));
  return payload;
}

async function processQueue(admin: any) {
  const { data: due, error } = await admin
    .from("campaign_recipients")
    .select("id, user_id, campaign_id, conversation_id, contact_phone, contact_name, variables, campaigns!inner(id, status, whatsapp_numbers(phone_number, provider_app_id), message_templates(name, language, variables, provider_template_id))")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .eq("campaigns.status", "running")
    .order("scheduled_at", { ascending: true })
    .limit(20);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const recipient of due ?? []) {
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
      await admin.from("campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: providerId }).eq("id", recipient.id);
      if (recipient.conversation_id) {
        await admin.from("messages").insert({
          user_id: recipient.user_id,
          conversation_id: recipient.conversation_id,
          direction: "outbound",
          body: `[Template] ${recipient.campaigns.message_templates.name}`,
          status: "sent",
          provider_message_id: providerId,
          metadata: { campaign_id: recipient.campaign_id, campaign_recipient_id: recipient.id, gupshup_response: gsBody },
        }).select("id").maybeSingle();
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
      const cronSecret = Deno.env.get("CRON_SECRET");
      const provided = req.headers.get("x-cron-secret") ?? "";
      if (!cronSecret || provided !== cronSecret) {
        return json({ error: "Unauthorized" }, 401);
      }
      return await processQueue(admin);
    }

    const auth = await getUser(req, supabaseUrl, anonKey);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    if (action === "launch") return await launchCampaign(admin, auth.user.id, body);
    if (action === "upsert_template") return await upsertTemplate(admin, auth.user.id, body);
    if (action === "sync_templates") return await syncTemplates(admin, auth.user.id, body);
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("campaigns error", msg);
    return json({ error: msg }, 500);
  }
});
