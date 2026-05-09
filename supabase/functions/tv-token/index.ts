import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Short, TV-friendly token: 10 chars from Crockford-like alphabet (no 0/O/1/I/L)
// ~50 bits of entropy, enough for short-lived URLs with DB lookup.
const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function generateToken(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "verify";
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "verify") {
      const body = await req.json().catch(() => ({}));
      const token = String(body?.token ?? "").trim();
      if (!token || token.length < 16 || token.length > 128) {
        return jsonResponse({ valid: false, error: "Invalid token" }, 400);
      }
      const { data, error } = await admin
        .from("tv_tokens")
        .select("id, expires_at, revoked_at, label")
        .eq("token", token)
        .maybeSingle();
      if (error) return jsonResponse({ valid: false, error: "Lookup failed" }, 500);
      if (!data) return jsonResponse({ valid: false, error: "Not found" }, 404);
      if (data.revoked_at) return jsonResponse({ valid: false, error: "Revoked" }, 403);
      if (new Date(data.expires_at).getTime() < Date.now())
        return jsonResponse({ valid: false, error: "Expired" }, 403);
      return jsonResponse({ valid: true, expires_at: data.expires_at, label: data.label });
    }

    // Admin-only actions (create / list / revoke)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    if (action === "create") {
      const body = await req.json().catch(() => ({}));
      const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 90);
      const label = body?.label ? String(body.label).slice(0, 80) : null;
      const token = generateToken();
      const expires_at = new Date(Date.now() + days * 86400000).toISOString();
      const { data, error } = await admin
        .from("tv_tokens")
        .insert({ token, label, expires_at, created_by: user.id })
        .select("id, token, label, expires_at, created_at")
        .single();
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true, ...data });
    }

    if (action === "list") {
      const { data, error } = await admin
        .from("tv_tokens")
        .select("id, token, label, expires_at, revoked_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ tokens: data });
    }

    if (action === "revoke") {
      const body = await req.json().catch(() => ({}));
      const id = String(body?.id ?? "");
      if (!id) return jsonResponse({ error: "id required" }, 400);
      const { error } = await admin
        .from("tv_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
