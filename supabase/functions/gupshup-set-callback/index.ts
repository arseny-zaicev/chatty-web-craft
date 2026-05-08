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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { number_id } = (await req.json()) as { number_id?: string };
    if (!number_id) return new Response(JSON.stringify({ error: "number_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: number } = await admin.from("whatsapp_numbers").select("id, provider_app_id, provider_api_key").eq("id", number_id).maybeSingle();
    if (!number?.provider_app_id) return new Response(JSON.stringify({ error: "Number missing provider_app_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = number.provider_api_key || Deno.env.get("GUPSHUP_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "No Gupshup API key available" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;

    // Try multiple Gupshup endpoints (account type varies)
    const endpoints = [
      { url: `https://api.gupshup.io/sm/api/v1/app/${number.provider_app_id}/callback`, method: "PUT" },
      { url: `https://api.gupshup.io/wa/app/${number.provider_app_id}/callback/inbound`, method: "PUT" },
    ];
    const attempts: Array<{ url: string; status: number; body: string }> = [];
    let success = false;
    for (const ep of endpoints) {
      const form = new URLSearchParams();
      form.set("callbackUrl", callbackUrl);
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await res.text();
      attempts.push({ url: ep.url, status: res.status, body: text.slice(0, 300) });
      if (res.ok) { success = true; break; }
    }

    if (success) {
      await admin.from("whatsapp_numbers").update({ connected_in_gupshup: true }).eq("id", number_id);
    }

    return new Response(JSON.stringify({ ok: success, callbackUrl, attempts }), {
      status: success ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
