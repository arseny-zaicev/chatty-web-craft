import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_VERSION = "send-whatsapp-inbox-debug-2026-05-08-1";
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
      .select("phone_number, provider_app_id, provider_api_key, display_name")
      .eq("id", conv.whatsapp_number_id)
      .maybeSingle();
    if (!number) {
      return new Response(JSON.stringify({ error: "WhatsApp number not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve which apikey to use:
    // 1) per-number app apikey (not sk_) → use directly
    // 2) per-number partner sk_ token → exchange for app token via Partner API
    // 3) otherwise → global GUPSHUP_API_KEY (only correct if it belongs to THIS app)
    let GUPSHUP_API_KEY: string | null = null;
    let keyType: "per-number-app" | "partner-exchanged" | "global" | "none" = "none";
    let exchangeDebug: unknown = null;
    const storedKeyType = number.provider_api_key
      ? String(number.provider_api_key).startsWith("sk_") ? "partner" : "app"
      : "none";

    if (number.provider_api_key && !number.provider_api_key.startsWith("sk_")) {
      GUPSHUP_API_KEY = number.provider_api_key;
      keyType = "per-number-app";
    } else if (number.provider_api_key?.startsWith("sk_") && number.provider_app_id) {
      try {
        const exchanged = await exchangePartnerToken(number.provider_app_id, number.provider_api_key);
        exchangeDebug = exchanged.attempts;
        if (exchanged.token) {
          GUPSHUP_API_KEY = exchanged.token;
          keyType = "partner-exchanged";
        }
      } catch (e) {
        exchangeDebug = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (!GUPSHUP_API_KEY && storedKeyType !== "partner") {
      GUPSHUP_API_KEY = Deno.env.get("GUPSHUP_API_KEY") ?? null;
      if (GUPSHUP_API_KEY) keyType = "global";
    }
    if (!GUPSHUP_API_KEY && storedKeyType === "partner") {
      const debug = { function_version: FUNCTION_VERSION, src_name: number.display_name ?? null, key_type: "partner-exchange-failed", stored_key_type: storedKeyType, partner_exchange: exchangeDebug };
      return new Response(JSON.stringify({ error: "Stored partner key could not be exchanged for an app send token", debug }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!GUPSHUP_API_KEY) {
      return new Response(JSON.stringify({ error: "No Gupshup API key available for this number" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize destination to digits-only with no leading +
    const destination = (conv.contact_phone || "").toString().replace(/[^\d]/g, "");
    const source = (number.phone_number || "").toString().replace(/[^\d]/g, "");

    // Send via Gupshup. src.name MUST be the Gupshup app name, not the app UUID.
    const form = new URLSearchParams();
    form.set("channel", "whatsapp");
    form.set("source", source);
    form.set("destination", destination);
    form.set("message", JSON.stringify({ type: "text", text }));
    if (number.display_name) form.set("src.name", number.display_name);

    const gsRes = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: {
        apikey: GUPSHUP_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const gsBody = await gsRes.json().catch(() => ({} as Record<string, unknown>));
    console.log("Gupshup send response", gsRes.status, JSON.stringify(gsBody), "src.name=", number.display_name, "src=", source, "dst=", destination, "keyType=", keyType);

    const providerMessageId = (gsBody as Record<string, unknown>).messageId as string | undefined;
    const gsStatus = (gsBody as Record<string, unknown>).status as string | undefined;
    const accepted = gsRes.ok && !!providerMessageId && gsStatus !== "error";

    const debug = {
      src_name: number.display_name ?? null,
      source,
      destination,
      key_type: keyType,
      partner_exchange: exchangeDebug,
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
