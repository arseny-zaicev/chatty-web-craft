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
    const rawUrl = (Deno.env.get("PERSONAL_SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
    const rawKey = (Deno.env.get("PERSONAL_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    console.log("Personal URL:", JSON.stringify(rawUrl), "key length:", rawKey.length);
    const personal = createClient(rawUrl, rawKey);

    // Paginate pull from personal (Supabase caps each select at 1000)
    const PAGE = 1000;
    const allRows: Array<{ phone: string; payload: any; derived_payload: any; validation_status: string }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: pullErr } = await personal
        .from("audience_rows")
        .select("phone, payload, derived_payload, validation_status")
        .eq("batch_id", batch_id)
        .order("phone")
        .range(from, from + PAGE - 1);
      if (pullErr) {
        console.error("pullErr", pullErr);
        return new Response(JSON.stringify({ error: `Personal pull failed: ${pullErr.message}`, details: pullErr }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!page || page.length === 0) break;
      allRows.push(...page);
      if (page.length < PAGE) break;
    }
    if (allRows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, message: "No rows found in personal Supabase for this batch_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: wipe any previously-imported rows for this batch in CRM
    const { error: delErr } = await crm.from("audience_rows").delete().eq("batch_id", batch_id);
    if (delErr) {
      return new Response(JSON.stringify({ error: `Reset failed: ${delErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: pick first non-empty name-like field from payload (case-insensitive).
    const NAME_KEYS = ["first_name", "firstname", "given_name", "givenname", "name", "fullname", "full_name"];
    const pickName = (payload: any): string => {
      if (!payload || typeof payload !== "object") return "";
      const lc: Record<string, any> = {};
      for (const k of Object.keys(payload)) lc[k.toLowerCase()] = payload[k];
      for (const k of NAME_KEYS) {
        const v = String(lc[k] ?? "").trim();
        if (v) return v.split(/\s+/)[0]; // first token only
      }
      return "";
    };

    let backfilled_var_1 = 0;
    const toInsert = allRows.map((r) => {
      const payload = r.payload ?? {};
      const dp: Record<string, any> = { ...(r.derived_payload ?? {}) };
      // Backfill var_1 from payload name fields when missing -> avoids "Hey there {{1}}" => "there there".
      if (!String(dp.var_1 ?? "").trim()) {
        const guess = pickName(payload);
        if (guess) { dp.var_1 = guess; backfilled_var_1 += 1; }
      }
      return {
        batch_id,
        workspace_id: batch.workspace_id,
        phone: r.phone,
        payload,
        derived_payload: dp,
        validation_status: r.validation_status ?? "valid",
        usage_status: "unused",
      };
    });

    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const slice = toInsert.slice(i, i + CHUNK);
      const { error: insErr } = await crm.from("audience_rows").insert(slice);
      if (insErr) {
        return new Response(JSON.stringify({ error: `Insert failed at offset ${i}: ${insErr.message}`, inserted_so_far: inserted }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inserted += slice.length;
    }

    return new Response(JSON.stringify({ inserted, pulled: allRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
