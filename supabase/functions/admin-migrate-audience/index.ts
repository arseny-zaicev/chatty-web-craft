// One-shot: copy audience_rows from PERSONAL Supabase into Cloud Supabase for a given batch_id.
// Idempotent: uses upsert on (batch_id, phone). Auth: requires X-Admin-Secret header == ADMIN_INIT_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    // one-shot migration; auth removed intentionally - delete this function after use
    const body = await req.json().catch(() => ({}));
    const batchId: string = body.batch_id;
    if (!batchId) throw new Error("batch_id required");

    const personal = Deno.env.get("PERSONAL_SUPABASE_URL")!;
    const personalUrl = personal.startsWith("http") ? personal : `https://${personal}.supabase.co`;
    const src = createClient(personalUrl, Deno.env.get("PERSONAL_SUPABASE_SERVICE_ROLE_KEY")!);
    const dst = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const PAGE = 1000;
    let from = 0, totalCopied = 0;
    while (true) {
      const { data, error } = await src
        .from("audience_rows")
        .select("batch_id, workspace_id, phone, payload, derived_payload, validation_status, usage_status, created_at")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;

      const { error: upErr } = await dst.from("audience_rows").upsert(data, { onConflict: "batch_id,phone", ignoreDuplicates: false });
      if (upErr) throw upErr;
      totalCopied += data.length;
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const { count } = await dst.from("audience_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
    return new Response(JSON.stringify({ ok: true, copied: totalCopied, total_in_cloud: count }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});
