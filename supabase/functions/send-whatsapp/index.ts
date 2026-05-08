import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(JSON.stringify({ error: "conversation_id and text required" }), {
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

    const GUPSHUP_API_KEY = Deno.env.get("GUPSHUP_API_KEY");
    if (!GUPSHUP_API_KEY) {
      return new Response(JSON.stringify({ error: "GUPSHUP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via Gupshup
    const form = new URLSearchParams();
    form.set("channel", "whatsapp");
    form.set("source", number.phone_number);
    form.set("destination", conv.contact_phone);
    form.set("message", JSON.stringify({ type: "text", text }));
    if (number.provider_app_id) form.set("src.name", number.provider_app_id);

    const gsRes = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
      method: "POST",
      headers: {
        apikey: GUPSHUP_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const gsBody = await gsRes.json().catch(() => ({}));
    console.log("Gupshup send response", gsRes.status, JSON.stringify(gsBody));

    if (!gsRes.ok || gsBody.status === "error") {
      // Persist failed message for visibility
      await admin.from("messages").insert({
        user_id: conv.user_id,
        conversation_id: conv.id,
        direction: "outbound",
        body: text,
        status: "failed",
        metadata: { gupshup_response: gsBody, http_status: gsRes.status },
      });
      return new Response(
        JSON.stringify({ error: "Gupshup send failed", details: gsBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const providerMessageId = (gsBody.messageId as string) ?? null;

    const { data: inserted } = await admin
      .from("messages")
      .insert({
        user_id: conv.user_id,
        conversation_id: conv.id,
        direction: "outbound",
        body: text,
        status: "sent",
        provider_message_id: providerMessageId,
        metadata: { gupshup_response: gsBody },
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
      JSON.stringify({ ok: true, message_id: inserted?.id, provider_message_id: providerMessageId }),
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
