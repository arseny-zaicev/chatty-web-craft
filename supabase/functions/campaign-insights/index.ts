// Generates an AI summary for a campaign: which segments converted, which copy worked,
// who to target more / exclude. Stored in campaign_insights.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

function bucket<T>(rows: T[], keyFn: (r: T) => string | null | undefined) {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const arr = out.get(k) || [];
    arr.push(r);
    out.set(k, arr);
  }
  return out;
}

function aggregate(rows: any[]) {
  const total = rows.length;
  const sent = rows.filter((r) => ["sent", "delivered", "read"].includes(String(r.delivery_status))).length;
  const failed = rows.filter((r) => r.delivery_status === "failed").length;
  const replied = rows.filter((r) => r.replied).length;
  const positive = rows.filter((r) => r.reply_sentiment === "positive").length;
  const meeting = rows.filter((r) => r.reply_intent === "meeting").length;

  function rateBy(keyFn: (r: any) => string | null | undefined, top = 8) {
    const groups = bucket(rows, keyFn);
    const items = Array.from(groups.entries()).map(([k, arr]) => {
      const s = arr.filter((r: any) => ["sent", "delivered", "read"].includes(String(r.delivery_status))).length;
      const r = arr.filter((x: any) => x.replied).length;
      const p = arr.filter((x: any) => x.reply_sentiment === "positive").length;
      return {
        value: k,
        n: arr.length,
        sent: s,
        replied: r,
        positive: p,
        reply_rate: s ? +(r / s * 100).toFixed(1) : 0,
        positive_rate: s ? +(p / s * 100).toFixed(1) : 0,
      };
    });
    return items.filter((i) => i.n >= 3).sort((a, b) => b.positive_rate - a.positive_rate).slice(0, top);
  }

  // Likely segmentation fields inside lead_payload
  const fields = ["industry", "role", "title", "country", "company_size", "employees", "city"];
  const bySegment: Record<string, any[]> = {};
  for (const f of fields) {
    const items = rateBy((r: any) => {
      const p = r.lead_payload || {};
      const v = p[f];
      return v ? String(v).slice(0, 60) : null;
    });
    if (items.length) bySegment[f] = items;
  }

  const byTemplate = rateBy((r: any) => r.template_name);
  const byNumber = rateBy((r: any) => r.whatsapp_number_label || r.whatsapp_number);

  return {
    totals: { total, sent, failed, replied, positive, meeting },
    by_segment: bySegment,
    by_template: byTemplate,
    by_number: byNumber,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id : null;
  if (!campaignId) {
    return new Response(JSON.stringify({ error: "campaign_id required" }), { status: 400, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: rows, error } = await admin
    .from("campaign_report_rows")
    .select("*")
    .eq("campaign_id", campaignId)
    .limit(50000);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, name, workspace_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) {
    return new Response(JSON.stringify({ error: "campaign not found" }), { status: 404, headers: corsHeaders });
  }

  const metrics = aggregate(rows || []);

  const prompt = `You are a B2B outreach analyst. Given the metrics from a WhatsApp campaign, write a concise actionable report in Markdown (~250-400 words).

Sections:
1. **Headline** - one sentence summary.
2. **What worked** - top segments by positive_rate (use by_segment + by_template). Quote numbers.
3. **What did not** - segments / templates with low reply or high not_interested.
4. **Recommendations** - what to scale, what to exclude, what to test next.
5. **Copy / offer** - which template performed best and a hypothesis why.

Be specific. Use numbers. No fluff. No emojis.

METRICS_JSON:
${JSON.stringify(metrics, null, 2)}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!aiResp.ok) {
    const t = await aiResp.text();
    return new Response(JSON.stringify({ error: "ai_failed", detail: t }), { status: 502, headers: corsHeaders });
  }
  const aiJson = await aiResp.json();
  const summary = aiJson?.choices?.[0]?.message?.content || "";

  await admin.from("campaign_insights").upsert({
    campaign_id: campaignId,
    workspace_id: campaign.workspace_id,
    summary_md: summary,
    metrics,
    model: "google/gemini-2.5-pro",
    generated_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ ok: true, summary, metrics }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
