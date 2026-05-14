// Branded campaign PDF report. Client-safe: no internal IDs, rates, costs, or model names.
// GET /campaign-report-pdf?campaign_id=<uuid>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2?deps=jspdf@2.5.1";
import { BRAND, BRAND_COPY, drawHeader, drawFooter, fmtDateDxb } from "../_shared/brand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Strip markdown so jsPDF renders clean text. Keeps headings as plain lines.
function cleanMd(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  if (!campaignId) return json({ error: "campaign_id required" }, 400);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
  );

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, name, workspace_id, started_at, completed_at, created_at")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr || !campaign) return json({ error: cErr?.message || "campaign not found" }, 404);

  const [{ data: liveRows }, { data: insight }, { data: workspace }] = await Promise.all([
    supabase.rpc("campaign_live_counts", { p_campaign_ids: [campaignId] }),
    supabase
      .from("campaign_insights")
      .select("summary_md, metrics, generated_at")
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    supabase.from("workspaces").select("name").eq("id", (campaign as any).workspace_id).maybeSingle(),
  ]);

  const totals = Array.isArray(liveRows) && liveRows[0] ? (liveRows[0] as any) : {
    total: 0, sent: 0, failed: 0, replied: 0, positive: 0, meeting: 0,
  };
  const metrics = (insight?.metrics as any) || {};
  const byTemplate: any[] = metrics.by_template || [];
  const byNumber: any[] = metrics.by_number || [];
  const bySegment: Record<string, any[]> = metrics.by_segment || {};

  // ---------- PDF ----------
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  let y = drawHeader(doc, {
    title: "Campaign report",
    subtitle: workspace?.name ? String(workspace.name) : undefined,
  });

  // Campaign block
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(String(campaign.name || "Campaign"), 40, y); y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.inkSoft);
  const startD = (campaign as any).started_at || (campaign as any).created_at;
  const endD = (campaign as any).completed_at;
  if (startD) {
    const range = endD ? `${fmtDateDxb(startD)} - ${fmtDateDxb(endD)}` : `Started ${fmtDateDxb(startD)}`;
    doc.text(range, 40, y); y += 12;
  }
  y += 8;

  // KPI strip
  const sent = Number(totals.sent || 0);
  const replied = Number(totals.replied || 0);
  const positive = Number(totals.positive || 0);
  const replyRate = sent > 0 ? (replied / sent) * 100 : 0;
  const positiveRate = sent > 0 ? (positive / sent) * 100 : 0;

  const kpis: [string, string][] = [
    ["Total", String(Number(totals.total || 0).toLocaleString())],
    ["Sent", sent.toLocaleString()],
    ["Failed", String(Number(totals.failed || 0).toLocaleString())],
    ["Replied", `${replied.toLocaleString()} (${replyRate.toFixed(1)}%)`],
    ["Positive", `${positive.toLocaleString()} (${positiveRate.toFixed(1)}%)`],
    ["Meetings", String(Number(totals.meeting || 0).toLocaleString())],
  ];
  doc.setDrawColor(...BRAND.rule);
  doc.setFillColor(...BRAND.cream);
  doc.roundedRect(40, y, W - 80, 70, 8, 8, "FD");
  const cw = (W - 80) / kpis.length;
  kpis.forEach(([lbl, val], i) => {
    const x = 40 + i * cw + 10;
    doc.setFont("helvetica", "normal"); doc.setTextColor(...BRAND.inkSoft); doc.setFontSize(8);
    doc.text(lbl, x, y + 22);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...BRAND.ink); doc.setFontSize(12);
    doc.text(val, x, y + 46);
  });
  y += 88;

  // AI summary (cleaned)
  if (insight?.summary_md) {
    if (y > 720) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...BRAND.emeraldDark);
    doc.text("Summary", 40, y); y += 14;

    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...BRAND.ink);
    const text = cleanMd(insight.summary_md);
    const lines = doc.splitTextToSize(text, W - 80) as string[];
    for (const line of lines) {
      if (y > 780) { doc.addPage(); y = 48; }
      doc.text(line, 40, y);
      y += 13;
    }
    y += 8;
  }

  // Templates breakdown
  if (byTemplate.length) {
    if (y > 680) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...BRAND.emeraldDark);
    doc.text("Template performance", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Template", "Sent", "Replied", "Positive", "Reply %", "Positive %"]],
      body: byTemplate.map((r) => [
        r.value, r.sent, r.replied, r.positive,
        `${Number(r.reply_rate || 0).toFixed(1)}%`,
        `${Number(r.positive_rate || 0).toFixed(1)}%`,
      ]),
      styles: { font: "helvetica", fontSize: 9, textColor: BRAND.ink as any },
      headStyles: { fillColor: BRAND.emeraldDark as any, textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Per-number breakdown (sender label only)
  if (byNumber.length) {
    if (y > 680) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...BRAND.emeraldDark);
    doc.text("Sender performance", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Sender", "Sent", "Replied", "Positive", "Reply %", "Positive %"]],
      body: byNumber.map((r) => [
        r.value, r.sent, r.replied, r.positive,
        `${Number(r.reply_rate || 0).toFixed(1)}%`,
        `${Number(r.positive_rate || 0).toFixed(1)}%`,
      ]),
      styles: { font: "helvetica", fontSize: 9, textColor: BRAND.ink as any },
      headStyles: { fillColor: BRAND.emerald as any, textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Segments
  const SEG_LABEL: Record<string, string> = {
    industry: "Industry", role: "Role", title: "Job title",
    country: "Country", city: "City", company_size: "Company size", employees: "Employees",
  };
  for (const [field, rows] of Object.entries(bySegment)) {
    if (!rows?.length) continue;
    if (y > 680) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...BRAND.emeraldDark);
    doc.text(`${SEG_LABEL[field] ?? field} - top segments`, 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      head: [[SEG_LABEL[field] ?? field, "Sent", "Replied", "Positive", "Reply %", "Positive %"]],
      body: rows.slice(0, 10).map((r: any) => [
        r.value, r.sent, r.replied, r.positive,
        `${Number(r.reply_rate || 0).toFixed(1)}%`,
        `${Number(r.positive_rate || 0).toFixed(1)}%`,
      ]),
      styles: { font: "helvetica", fontSize: 9, textColor: BRAND.ink as any },
      headStyles: { fillColor: BRAND.emerald as any, textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  drawFooter(doc, BRAND_COPY.product);

  const pdfBytes = doc.output("arraybuffer") as ArrayBuffer;
  const safeName = String(campaign.name || "campaign").replace(/[^a-z0-9-_]+/gi, "_");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}-${stamp}.pdf"`,
    },
  });
});
