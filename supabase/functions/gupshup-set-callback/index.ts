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

    const isPartnerKey = apiKey.startsWith("sk_");
    const attempts: Array<{ url: string; method: string; status: number; body: string; auth: string }> = [];
    let success = false;

    const tryEndpoint = async (url: string, method: string, headers: Record<string, string>, body: string, authLabel: string) => {
      try {
        const res = await fetch(url, { method, headers, body });
        const text = await res.text();
        attempts.push({ url, method, status: res.status, body: text.slice(0, 300), auth: authLabel });
        return res.ok;
      } catch (e) {
        attempts.push({ url, method, status: 0, body: e instanceof Error ? e.message : "fetch error", auth: authLabel });
        return false;
      }
    };

    const form = () => {
      const f = new URLSearchParams();
      f.set("callbackUrl", callbackUrl);
      return f.toString();
    };

    // 1) Partner API (works with sk_ partner tokens). Needs partner login token, not the sk_ directly.
    //    Try the partner-app endpoint first using the sk_ as Authorization (some accounts accept it).
    if (isPartnerKey) {
      const partnerUrl = `https://partner.gupshup.io/partner/app/${number.provider_app_id}/callbackUrl`;
      success = await tryEndpoint(
        partnerUrl,
        "PUT",
        { Authorization: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        form(),
        "partner sk_",
      );
    }

    // 2) Standard app apikey endpoint
    if (!success) {
      success = await tryEndpoint(
        `https://api.gupshup.io/sm/api/v1/app/${number.provider_app_id}/callback`,
        "PUT",
        { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
        form(),
        "app apikey",
      );
    }

    // 3) Try with global app key fallback if per-number key failed
    const globalKey = Deno.env.get("GUPSHUP_API_KEY");
    if (!success && globalKey && globalKey !== apiKey) {
      success = await tryEndpoint(
        `https://api.gupshup.io/sm/api/v1/app/${number.provider_app_id}/callback`,
        "PUT",
        { apikey: globalKey, "Content-Type": "application/x-www-form-urlencoded" },
        form(),
        "global apikey",
      );
    }

    if (success) {
      await admin.from("whatsapp_numbers").update({ connected_in_gupshup: true }).eq("id", number_id);
    }

    // Return 200 even on failure so the client can show actionable details (avoids generic 502 in browser)
    return new Response(
      JSON.stringify({
        ok: success,
        callbackUrl,
        manualInstructions: success ? null : "Auto-registration failed. In Gupshup app dashboard, open Settings → Callback URL and paste the callbackUrl above. Enable inbound message events.",
        attempts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
