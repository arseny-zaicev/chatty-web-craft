// Generates a PDF + CSV payout report for a given run, uploads both to Storage,
// updates the run row with the storage paths, and returns signed URLs.
// POST { run_id: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2?deps=jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtUsd(n: number) {
  return `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Verify caller is admin
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: u.user.id }).single();
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { run_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  if (!body.run_id) return json({ error: "run_id required" }, 400);

  // Fetch run + partner + line items + numbers + workspaces
  const { data: run, error: runErr } = await admin
    .from("payout_runs").select("*").eq("id", body.run_id).single();
  if (runErr || !run) return json({ error: runErr?.message || "run not found" }, 404);

  const { data: partner } = await admin.from("partners").select("*").eq("id", run.partner_id).single();
  const { data: items } = await admin.from("payout_line_items").select("*")
    .eq("payout_run_id", run.id).order("day").order("whatsapp_number_id");

  const numberIds = Array.from(new Set((items || []).map((i: any) => i.whatsapp_number_id).filter(Boolean)));
  const wsIds = Array.from(new Set((items || []).map((i: any) => i.workspace_id).filter(Boolean)));
  const [{ data: numbers }, { data: workspaces }] = await Promise.all([
    numberIds.length
      ? admin.from("whatsapp_numbers").select("id, phone_number, display_name, label").in("id", numberIds)
      : Promise.resolve({ data: [] as any[] }),
    wsIds.length
      ? admin.from("workspaces").select("id, name, slug").in("id", wsIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const numMap = new Map((numbers || []).map((n: any) => [n.id, n]));
  const wsMap = new Map((workspaces || []).map((w: any) => [w.id, w]));
  const numLabel = (id: string | null) => {
    if (!id) return "-";
    const n = numMap.get(id) as any; if (!n) return id.slice(0, 8);
    return n.display_name || n.label || n.phone_number || id.slice(0, 8);
  };
  const wsLabel = (id: string | null) => (id && (wsMap.get(id) as any)?.name) || "-";

  // ---------- CSV ----------
  const csvHeader = ["day","number","client","delivered","failed","sent","partner_rate_usd","client_rate_usd","payout_usd","billed_usd","margin_usd","is_adjustment","notes"];
  const csvRows = [csvHeader.join(",")];
  for (const r of items || []) {
    csvRows.push([
      r.day, numLabel(r.whatsapp_number_id), wsLabel(r.workspace_id),
      r.delivered, r.failed, r.sent,
      r.partner_rate_usd, r.client_rate_usd, r.payout_usd, r.billed_usd, r.margin_usd,
      r.is_adjustment, r.notes,
    ].map(csvCell).join(","));
  }
  const csv = csvRows.join("\n");

  // ---------- PDF ----------
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("Partner Payout Report", 40, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
  doc.text("Iskra · WhatsApp Outreach", 40, y + 12); y += 28;

  doc.setTextColor(20); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(partner?.name || "Partner", 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  if (partner?.contact_email) { doc.text(partner.contact_email, 40, y); y += 11; }
  doc.text(`Period: ${run.period_from} → ${run.period_to}`, 40, y); y += 11;
  doc.text(`Run ID: ${run.id}`, 40, y); y += 11;
  doc.text(`Generated: ${new Date(run.generated_at).toISOString()}`, 40, y); y += 11;
  doc.text(`Status: ${String(run.status).toUpperCase()}`, 40, y); y += 18;

  // Totals box
  doc.setDrawColor(220); doc.setFillColor(248, 248, 245);
  doc.roundedRect(40, y, W - 80, 70, 6, 6, "FD");
  doc.setTextColor(20); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  const cells = [
    ["Delivered", String(run.totals_delivered)],
    ["Failed", String(run.totals_failed)],
    ["Sent", String(run.totals_sent)],
    ["Payout", fmtUsd(Number(run.total_payout_usd))],
    ["Billed", fmtUsd(Number(run.total_billed_usd))],
    ["Margin", fmtUsd(Number(run.margin_usd))],
  ];
  const cw = (W - 80) / cells.length;
  cells.forEach(([lbl, val], i) => {
    const x = 40 + i * cw + 12;
    doc.setFont("helvetica", "normal"); doc.setTextColor(120); doc.setFontSize(8);
    doc.text(String(lbl), x, y + 22);
    doc.setFont("helvetica", "bold"); doc.setTextColor(20); doc.setFontSize(13);
    doc.text(String(val), x, y + 46);
  });
  y += 88;

  // Per-number summary
  const byNumber = new Map<string, { number: string; client: string; delivered: number; failed: number; payout: number; billed: number }>();
  for (const r of items || []) {
    const k = `${r.whatsapp_number_id}|${r.workspace_id}`;
    const existing = byNumber.get(k) || { number: numLabel(r.whatsapp_number_id), client: wsLabel(r.workspace_id), delivered: 0, failed: 0, payout: 0, billed: 0 };
    existing.delivered += r.delivered; existing.failed += r.failed;
    existing.payout += Number(r.payout_usd); existing.billed += Number(r.billed_usd);
    byNumber.set(k, existing);
  }
  autoTable(doc, {
    startY: y,
    head: [["Number", "Client", "Delivered", "Failed", "Payout", "Billed"]],
    body: Array.from(byNumber.values()).map(r => [r.number, r.client, r.delivered, r.failed, fmtUsd(r.payout), fmtUsd(r.billed)]),
    styles: { font: "helvetica", fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    margin: { left: 40, right: 40 },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  // Per-day breakdown (compact)
  if ((items || []).length) {
    if (y > 700) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
    doc.text("Daily breakdown", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Day", "Number", "Client", "Delivered", "Failed", "P. rate", "C. rate", "Payout"]],
      body: (items || []).map((r: any) => [
        r.day, numLabel(r.whatsapp_number_id), wsLabel(r.workspace_id),
        r.delivered, r.failed, fmtUsd(Number(r.partner_rate_usd)), fmtUsd(Number(r.client_rate_usd)), fmtUsd(Number(r.payout_usd)),
      ]),
      styles: { font: "helvetica", fontSize: 8 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Verification footer
  if (y > 740) { doc.addPage(); y = 48; }
  doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Verification — source events: ${run.source_event_count}  ·  hash: ${(run.source_data_hash || "-").slice(0, 16)}…`, 40, y); y += 11;
  doc.text(`Rates as of ${new Date(run.generated_at).toISOString()}. Computed from raw provider delivery events.`, 40, y);
  if (run.status === "void") {
    doc.setTextColor(180, 30, 30); doc.setFontSize(36);
    doc.text("VOID", W / 2 - 40, 400);
  }

  const pdfBytes = doc.output("arraybuffer") as ArrayBuffer;

  // ---------- Upload ----------
  const stamp = `${run.period_from}_${run.period_to}_${run.id.slice(0, 8)}`;
  const pdfPath = `${run.partner_id}/${stamp}.pdf`;
  const csvPath = `${run.partner_id}/${stamp}.csv`;
  await admin.storage.from("payout-reports").upload(pdfPath, new Uint8Array(pdfBytes), {
    contentType: "application/pdf", upsert: true,
  });
  await admin.storage.from("payout-reports").upload(csvPath, new TextEncoder().encode(csv), {
    contentType: "text/csv", upsert: true,
  });

  await admin.from("payout_runs").update({
    pdf_storage_path: pdfPath, csv_storage_path: csvPath,
  }).eq("id", run.id);

  const [{ data: pdfUrl }, { data: csvUrl }] = await Promise.all([
    admin.storage.from("payout-reports").createSignedUrl(pdfPath, 60 * 60 * 24),
    admin.storage.from("payout-reports").createSignedUrl(csvPath, 60 * 60 * 24),
  ]);

  return json({ pdf_url: pdfUrl?.signedUrl, csv_url: csvUrl?.signedUrl, pdf_path: pdfPath, csv_path: csvPath });
});
