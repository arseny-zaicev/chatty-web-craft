// Send an approved WhatsApp template from the inbox composer.
//
// Why: the inbox `send-whatsapp` function only sends free text. After the 24h
// session window expires, WhatsApp rejects free text and only approved
// templates can re-open the conversation. This function lets a setter pick
// an admin-curated template group; we auto-select the variant whose
// `whatsapp_number_id` matches the conversation, so no chance of sending a
// template that belongs to a different number.
//
// Body: { conversation_id: uuid, template_group_id: uuid, variables?: Record<string,string> }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildTemplateParams,
  renderTemplateBody,
} from "../_shared/template.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_VERSION = "send-whatsapp-template-2026-05-20-1";
const GUPSHUP_TEMPLATE_ENDPOINT = "https://api.gupshup.io/wa/api/v1/template/msg";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function exchangePartnerToken(appId: string, partnerToken: string) {
  const attempts = [
    { headers: { Authorization: partnerToken, accept: "application/json" } },
    { headers: { token: partnerToken, accept: "application/json" } },
  ];
  for (const attempt of attempts) {
    const res = await fetch(
      `https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/token/`,
      { method: "GET", headers: attempt.headers },
    );
    const body = await res.json().catch(() => ({}));
    const tokenValue = (body as Record<string, unknown>)?.token as { token?: string } | string | undefined;
    const appToken = typeof tokenValue === "string" ? tokenValue : tokenValue?.token;
    if (res.ok && appToken) return appToken;
  }
  return "";
}

async function postGupshupTemplate({
  apiKey, source, destination, srcName, templateId, params,
}: {
  apiKey: string;
  source: string;
  destination: string;
  srcName: string | null;
  templateId: string;
  params: string[];
}) {
  const form = new URLSearchParams();
  form.set("source", source);
  form.set("destination", destination);
  form.set("template", JSON.stringify({ id: templateId, params }));
  if (srcName) form.set("src.name", srcName);
  const res = await fetch(GUPSHUP_TEMPLATE_ENDPOINT, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  return { res, payload: payload as Record<string, unknown> };
}

const normalizeName = (n: string) =>
  n.toLowerCase().trim().replace(/[\s-]+/g, "_").replace(/_+/g, "_");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supa.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const conversation_id = String(body?.conversation_id || "");
    const template_group_id = String(body?.template_group_id || "");
    const userVariables: Record<string, string> =
      body?.variables && typeof body.variables === "object" ? body.variables : {};
    if (!conversation_id || !template_group_id) {
      return json({ error: "conversation_id and template_group_id required", function_version: FUNCTION_VERSION }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Load conversation
    const { data: conv } = await admin
      .from("conversations")
      .select("id, user_id, contact_phone, contact_name, whatsapp_number_id, workspace_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conv) return json({ error: "Conversation not found" }, 404);

    // 2. Authorize: user must be a workspace member (or global admin)
    let allowed = false;
    if (conv.user_id === userId) allowed = true;
    if (!allowed) {
      const { data: isAdminData } = await admin.rpc("is_admin", { _user_id: userId });
      if (isAdminData) allowed = true;
    }
    if (!allowed && conv.workspace_id) {
      const { data: member } = await admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", conv.workspace_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (member) allowed = true;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // 3. Whitelisted? Must exist in workspace_quick_template_groups for this workspace.
    const { data: quick } = await admin
      .from("workspace_quick_template_groups")
      .select("id, template_group_id, label")
      .eq("workspace_id", conv.workspace_id)
      .eq("template_group_id", template_group_id)
      .maybeSingle();
    if (!quick) return json({ error: "This template group is not enabled as a quick reply for this workspace." }, 403);

    // 4. Load the template_group and resolve approved variants for this workspace.
    const { data: group } = await admin
      .from("template_groups")
      .select("id, name, category, template_names, workspace_id")
      .eq("id", template_group_id)
      .maybeSingle();
    if (!group || group.workspace_id !== conv.workspace_id) {
      return json({ error: "Template group not found" }, 404);
    }
    const wantedNames = new Set((group.template_names as string[]).map(normalizeName));

    const { data: templates } = await admin
      .from("message_templates")
      .select("id, name, language, variables, provider_template_id, body, status, whatsapp_number_id, user_id")
      .eq("workspace_id", conv.workspace_id);

    const variants = (templates ?? []).filter(
      (t) => wantedNames.has(normalizeName(t.name)) && t.status === "approved",
    );

    // 5. Auto-pick variant matching this conversation's number.
    const variant = variants.find((t) => t.whatsapp_number_id === conv.whatsapp_number_id);
    if (!variant) {
      return json({
        error: `No approved variant of "${group.name}" exists for the WhatsApp number used in this chat. Ask an admin to add or approve one.`,
      }, 400);
    }

    // 6. Number / credentials
    const { data: number } = await admin
      .from("whatsapp_numbers")
      .select("phone_number, provider_app_id, provider_api_key, display_name, is_active")
      .eq("id", conv.whatsapp_number_id)
      .maybeSingle();
    if (!number) return json({ error: "WhatsApp number not found" }, 404);
    if (!number.is_active) return json({ error: "WhatsApp number is inactive" }, 400);

    const storedKey = (number.provider_api_key || "").toString().trim();
    if (!storedKey) {
      return json({ error: "This WhatsApp number has no per-number API key" }, 400);
    }

    // 7. Build variables. Default {1} = contact_name (fallback "there" via helper).
    const variableNames = Array.isArray(variant.variables) ? (variant.variables as string[]) : [];
    const values: Record<string, string> = { ...userVariables };
    if (variableNames.length > 0 && !values[variableNames[0]]) {
      values[variableNames[0]] = (conv.contact_name || "").toString();
    }
    const params = buildTemplateParams(variant, values);

    const source = String(number.phone_number || "").replace(/[^\d]/g, "");
    const destination = String(conv.contact_phone || "").replace(/[^\d]/g, "");
    const srcName = number.display_name ?? null;
    const templateId = variant.provider_template_id || variant.name;

    // 8. Send (matches campaign sendTemplate retry behaviour).
    let { res, payload } = await postGupshupTemplate({
      apiKey: storedKey, source, destination, srcName, templateId, params,
    });

    if ((res.status === 401 || res.status === 403) && storedKey.startsWith("sk_") && number.provider_app_id) {
      const appToken = await exchangePartnerToken(number.provider_app_id, storedKey);
      if (appToken) {
        ({ res, payload } = await postGupshupTemplate({
          apiKey: appToken, source, destination, srcName, templateId, params,
        }));
      }
    }

    const providerMessageId = payload.messageId as string | undefined;
    const providerStatus = payload.status as string | undefined;
    const accepted = res.ok && !!providerMessageId && providerStatus !== "error";

    const renderedBody = renderTemplateBody(variant.body, variableNames, values);

    const debug = {
      function_version: FUNCTION_VERSION,
      template_id: variant.id,
      template_name: variant.name,
      template_group: group.name,
      provider_template_id: templateId,
      params,
      source,
      destination,
      http_status: res.status,
      provider_status: providerStatus ?? null,
      provider_message: payload.message ?? null,
      provider_message_id: providerMessageId ?? null,
      provider_body: payload,
    };

    if (!accepted) {
      await admin.from("messages").insert({
        user_id: conv.user_id,
        sent_by_user_id: userId,
        conversation_id: conv.id,
        direction: "outbound",
        body: renderedBody || `[template] ${variant.name}`,
        status: "failed",
        metadata: { kind: "template", template_id: variant.id, debug, gupshup_response: payload },
      });
      return json({ error: "Gupshup did not accept the template", debug }, 502);
    }

    const { data: inserted } = await admin
      .from("messages")
      .insert({
        user_id: conv.user_id,
        sent_by_user_id: userId,
        conversation_id: conv.id,
        direction: "outbound",
        body: renderedBody,
        status: "sent",
        provider_message_id: providerMessageId,
        metadata: { kind: "template", template_id: variant.id, template_group_id: group.id, debug },
      })
      .select("id")
      .single();

    // Best-effort event log (mirrors send-whatsapp).
    await admin.from("whatsapp_message_events").insert({
      event_type: "enqueued",
      provider_message_id: providerMessageId,
      message_id: inserted?.id ?? null,
      whatsapp_number_id: conv.whatsapp_number_id,
      raw: { kind: "template", gupshup_response: payload, http_status: res.status },
    }).then(() => {}, () => {});

    return json({ ok: true, message_id: inserted?.id, provider_message_id: providerMessageId, debug });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-whatsapp-template error", msg);
    return json({ error: msg }, 500);
  }
});
