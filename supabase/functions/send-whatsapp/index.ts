import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_VERSION = "send-whatsapp-inbox-debug-2026-05-08-2";
const GUPSHUP_SEND_ENDPOINT = "https://api.gupshup.io/wa/api/v1/msg";

async function readJson(res: Response) {
  return await res.json().catch(() => ({} as Record<string, unknown>));
}

async function exchangePartnerToken(appId: string, partnerToken: string) {
  const attempts = [
    { label: "authorization", headers: { Authorization: partnerToken, accept: "application/json" } },
    { label: "token", headers: { token: partnerToken, accept: "application/json" } },
  ];
  const results: Array<{ label: string; status: number; body: unknown }> = [];
  for (const attempt of attempts) {
    const res = await fetch(`https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/token/`, {
      method: "GET",
      headers: attempt.headers,
    });
    const body = await readJson(res);
    results.push({ label: attempt.label, status: res.status, body });
    const tokenValue = (body as Record<string, unknown>)?.token as { token?: string } | string | undefined;
    const appToken = typeof tokenValue === "string" ? tokenValue : tokenValue?.token;
    if (res.ok && appToken) return { token: appToken, attempts: results };
  }
  return { token: "", attempts: results };
}

async function sendTextMessage({
  apiKey,
  source,
  destination,
  text,
  srcName,
}: {
  apiKey: string;
  source: string;
  destination: string;
  text: string;
  srcName: string | null;
}) {
  const form = new URLSearchParams();
  form.set("channel", "whatsapp");
  form.set("source", source);
  form.set("destination", destination);
  form.set("message", JSON.stringify({ type: "text", text }));
  if (srcName) form.set("src.name", srcName);

  const response = await fetch(GUPSHUP_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  return { response, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    const body = await req.json();
    const { conversation_id, text } = body as { conversation_id?: string; text?: string };
    if (!conversation_id || !text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "conversation_id and text required", function_version: FUNCTION_VERSION }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 4096) {
      return new Response(JSON.stringify({ error: "text too long" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation + number using service role to bypass RLS once we've authorized via getClaims
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conv, error: convErr } = await admin
      .from("conversations")
      .select("id, user_id, contact_phone, whatsapp_number_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (conv.user_id !== userId) {
      // Allow admin
      const { data: isAdminData } = await admin.rpc("is_admin", { _user_id: userId });
      if (!isAdminData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: number } = await admin
      .from("whatsapp_numbers")
      .select("phone_number, provider_app_id, provider_api_key, display_name, is_active, connected_in_gupshup")
      .eq("id", conv.whatsapp_number_id)
      .maybeSingle();
    if (!number) {
      return new Response(JSON.stringify({ error: "WhatsApp number not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!number.is_active) {
      return new Response(JSON.stringify({ error: "This WhatsApp number is inactive. Activate and connect the exact number before sending." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!number.provider_app_id) {
      return new Response(JSON.stringify({ error: "This WhatsApp number has no Gupshup app ID. Sync the exact app before sending." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storedApiKey = number.provider_api_key?.trim() || null;
    const storedKeyType = storedApiKey
      ? storedApiKey.startsWith("sk_") ? "partner-like" : "app"
      : "none";

    if (!storedApiKey) {
      return new Response(JSON.stringify({ error: "This WhatsApp number has no per-number API key. Refusing global fallback to prevent sending from the wrong number." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize destination to digits-only with no leading +
    const destination = (conv.contact_phone || "").toString().replace(/[^\d]/g, "");
    const source = (number.phone_number || "").toString().replace(/[^\d]/g, "");

    const sendAttempts: Array<{ key_type: string; http_status: number; provider_body: unknown }> = [];
    let keyType: "per-number-app" | "per-number-direct-sk" | "partner-exchanged" | "global" | "none" = "none";
    let exchangeDebug: unknown = null;

    let gsRes: Response | null = null;
    let gsBody: Record<string, unknown> = {};

    if (storedApiKey) {
      const initialSend = await sendTextMessage({
        apiKey: storedApiKey,
        source,
        destination,
        text,
        srcName: number.display_name ?? null,
      });
      gsRes = initialSend.response;
      gsBody = initialSend.body as Record<string, unknown>;
      keyType = storedApiKey.startsWith("sk_") ? "per-number-direct-sk" : "per-number-app";
      sendAttempts.push({ key_type: keyType, http_status: gsRes.status, provider_body: gsBody });

      if ((gsRes.status === 401 || gsRes.status === 403) && storedApiKey.startsWith("sk_") && number.provider_app_id) {
        try {
          const exchanged = await exchangePartnerToken(number.provider_app_id, storedApiKey);
          exchangeDebug = exchanged.attempts;
          if (exchanged.token) {
            const retrySend = await sendTextMessage({
              apiKey: exchanged.token,
              source,
              destination,
              text,
              srcName: number.display_name ?? null,
            });
            gsRes = retrySend.response;
            gsBody = retrySend.body as Record<string, unknown>;
            keyType = "partner-exchanged";
            sendAttempts.push({ key_type: keyType, http_status: gsRes.status, provider_body: gsBody });
          }
        } catch (e) {
          exchangeDebug = { error: e instanceof Error ? e.message : String(e) };
        }
      }

    }

    if (!gsRes) {
      return new Response(JSON.stringify({ error: "No valid per-number Gupshup API key available for this number" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Gupshup send response", gsRes.status, JSON.stringify(gsBody), "src.name=", number.display_name, "src=", source, "dst=", destination, "keyType=", keyType);

    const providerMessageId = (gsBody as Record<string, unknown>).messageId as string | undefined;
    const gsStatus = (gsBody as Record<string, unknown>).status as string | undefined;
    const accepted = gsRes.ok && !!providerMessageId && gsStatus !== "error";

    const debug = {
      function_version: FUNCTION_VERSION,
      request_path: GUPSHUP_SEND_ENDPOINT,
      src_name: number.display_name ?? null,
      source,
      destination,
      key_type: keyType,
      stored_key_type: storedKeyType,
      partner_exchange: exchangeDebug,
      send_attempts: sendAttempts,
      http_status: gsRes.status,
      provider_status: gsStatus ?? null,
      provider_message: (gsBody as Record<string, unknown>).message ?? null,
      provider_message_id: providerMessageId ?? null,
      provider_body: gsBody,
    };

    if (!accepted) {
      await admin.from("messages").insert({
        user_id: conv.user_id,
        conversation_id: conv.id,
        direction: "outbound",
        body: text,
        status: "failed",
        metadata: { gupshup_response: gsBody, http_status: gsRes.status, debug },
      });
      return new Response(
        JSON.stringify({ error: "Gupshup did not accept the message", debug }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: inserted } = await admin
      .from("messages")
      .insert({
        user_id: conv.user_id,
        conversation_id: conv.id,
        direction: "outbound",
        body: text,
        status: "sent",
        provider_message_id: providerMessageId,
        metadata: { gupshup_response: gsBody, debug },
      })
      .select("id, created_at")
      .single();

    // Persist provider event for visibility ("enqueued" = accepted by provider).
    await admin.from("whatsapp_message_events").insert({
      event_type: "enqueued",
      provider_message_id: providerMessageId,
      message_id: inserted?.id ?? null,
      whatsapp_number_id: conv.whatsapp_number_id,
      raw: { gupshup_response: gsBody, http_status: gsRes.status },
    });

    await admin
      .from("conversations")
      .update({
        last_message_text: text,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conv.id);

    return new Response(
      JSON.stringify({ ok: true, message_id: inserted?.id, provider_message_id: providerMessageId, debug }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("send-whatsapp error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
