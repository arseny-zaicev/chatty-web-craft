import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data, error } = await admin.rpc("is_admin", { _user_id: user.id });
  if (error) return false;
  return data === true;
}

async function replayOne(id: string): Promise<{ id: string; ok: boolean; error?: string }> {
  const { data: row, error } = await admin
    .from("whatsapp_webhook_failures")
    .select("id, payload, replay_status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return { id, ok: false, error: error?.message ?? "not found" };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row.payload),
    });
    const okHttp = res.ok;
    // Check whether this row was matched on replay: a successful match would NOT
    // create another failure row, so the easiest signal is to re-query: if a new
    // failure with same payload exists it failed again. Simpler: trust webhook
    // result + presence of conversation will be visible in admin.
    await admin
      .from("whatsapp_webhook_failures")
      .update({
        replay_status: okHttp ? "replayed" : "failed",
        replay_error: okHttp ? null : `HTTP ${res.status}`,
        replayed_at: new Date().toISOString(),
      })
      .eq("id", id);
    return { id, ok: okHttp, error: okHttp ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("whatsapp_webhook_failures")
      .update({ replay_status: "failed", replay_error: msg, replayed_at: new Date().toISOString() })
      .eq("id", id);
    return { id, ok: false, error: msg };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!(await isAdmin(req))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const replayAll = body?.all === true;

    if (replayAll && ids.length === 0) {
      const { data } = await admin
        .from("whatsapp_webhook_failures")
        .select("id")
        .eq("replay_status", "pending")
        .order("created_at", { ascending: true })
        .limit(200);
      ids = (data ?? []).map((r) => r.id);
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, replayed: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const id of ids) {
      results.push(await replayOne(id));
    }
    return new Response(
      JSON.stringify({ ok: true, replayed: results.filter((r) => r.ok).length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
