import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { batch_id } = await req.json();
    if (!batch_id || typeof batch_id !== "string") {
      return new Response(JSON.stringify({ error: "batch_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: require logged-in user
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const crm = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await crm.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load batch + verify caller is workspace manager
    const { data: batch, error: batchErr } = await crm
      .from("audience_batches")
      .select("id, workspace_id")
      .eq("id", batch_id)
      .maybeSingle();
    if (batchErr || !batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isMgr } = await crm.rpc("is_workspace_manager", {
      _workspace_id: batch.workspace_id, _user_id: userData.user.id,
    });
    if (!isMgr) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connect to user's personal Supabase
    const personal = createClient(
      Deno.env.get("PERSONAL_SUPABASE_URL")!,
      Deno.env.get("PERSONAL_SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error: pullErr } = await personal
      .from("audience_rows")
      .select("phone, payload, validation_status")
      .eq("batch_tag", batch_id);
    if (pullErr) {
      return new Response(JSON.stringify({ error: `Personal pull failed: ${pullErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, message: "No rows found in personal Supabase for this batch_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toInsert = rows.map((r: any) => ({
      batch_id,
      workspace_id: batch.workspace_id,
      phone: r.phone,
      full_name: r.full_name ?? null,
      country_code: r.country_code ?? null,
      payload: r.payload ?? {},
      validation_status: r.validation_status ?? "valid",
      usage_status: "unused",
    }));

    const { error: insErr, count } = await crm
      .from("audience_rows")
      .insert(toInsert, { count: "exact" });
    if (insErr) {
      return new Response(JSON.stringify({ error: `Insert failed: ${insErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ inserted: count ?? toInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
