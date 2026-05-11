// Streams a CSV report for a campaign. Auth: requires logged-in workspace member.
// Query: GET /campaign-report-export?campaign_id=<uuid>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function csvCell(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  if (!campaignId) {
    return new Response(JSON.stringify({ error: "campaign_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use the user's JWT so RLS applies (only workspace members can read).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc("get_campaign_report", { p_campaign_id: campaignId });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (data || []) as Record<string, unknown>[];

  // Collect all keys from lead_payload to flatten as columns.
  const payloadKeys = new Set<string>();
  for (const r of rows) {
    const p = r.lead_payload as Record<string, unknown> | null;
    if (p && typeof p === "object") {
      for (const k of Object.keys(p)) {
        if (!k.startsWith("__")) payloadKeys.add(k);
      }
    }
  }
  const payloadCols = Array.from(payloadKeys).sort();

  const baseCols = [
    "contact_phone",
    "contact_name",
    "delivery_status",
    "sent_at",
    "error_message",
    "whatsapp_number",
    "template_name",
    "template_body",
    "replied",
    "reply_sentiment",
    "reply_intent",
    "first_reply_text",
    "first_reply_at",
    "time_to_first_reply_seconds",
    "campaign_name",
    "conversation_id",
  ];
  const header = [...baseCols, ...payloadCols.map((k) => `lead_${k}`)];

  const lines: string[] = [header.map(csvCell).join(",")];
  for (const r of rows) {
    const payload = (r.lead_payload as Record<string, unknown> | null) || {};
    const row = [
      ...baseCols.map((k) => csvCell(r[k])),
      ...payloadCols.map((k) => csvCell(payload[k])),
    ];
    lines.push(row.join(","));
  }

  const campaignName =
    rows[0]?.campaign_name ? String(rows[0].campaign_name).replace(/[^a-z0-9-_]+/gi, "_") : "campaign";
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${campaignName}-${stamp}.csv`;

  return new Response(lines.join("\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
