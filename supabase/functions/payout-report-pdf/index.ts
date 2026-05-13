// Generates a PDF + CSV payout report for a given run, uploads both to Storage,
// updates the run row with the storage paths, and returns signed URLs.
// POST { run_id: string, mode?: "internal" | "partner" }
//
// mode=internal (default): full admin view with client rate, billed, margin
// mode=partner: clean partner-facing view (no internal info, no manager)
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

// Money totals: 2 decimals.
function fmtUsd(n: number) {
  return `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Per-delivered rates: 4 decimals so 0.005 doesn't round to 0.01.
function fmtRate(n: number) {
  return `$${Number(n || 0).toFixed(4)}`;
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

  let body: { run_id?: string; mode?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  if (!body.run_id) return json({ error: "run_id required" }, 400);
  const mode: "internal" | "partner" = body.mode === "partner" ? "partner" : "internal";

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
  let csv: string;
  if (mode === "partner") {
    const header = ["day", "number", "client", "delivered", "failed", "partner_rate_usd", "partner_payout_usd"];
    const lines = [header.join(",")];
    for (const r of items || []) {
      lines.push([
        r.day, numLabel(r.whatsapp_number_id), wsLabel(r.workspace_id),
        r.delivered, r.failed, r.partner_rate_usd, r.payout_usd,
      ].map(csvCell).join(","));
    }
    csv = lines.join("\n");
  } else {
    const header = ["day", "number", "client", "delivered", "failed", "sent",
      "partner_rate_usd", "client_rate_usd", "partner_payout_usd", "client_billed_usd", "our_margin_usd",
      "is_adjustment", "notes"];
    const lines = [header.join(",")];
    for (const r of items || []) {
      lines.push([
        r.day, numLabel(r.whatsapp_number_id), wsLabel(r.workspace_id),
        r.delivered, r.failed, r.sent,
        r.partner_rate_usd, r.client_rate_usd, r.payout_usd, r.billed_usd, r.margin_usd,
        r.is_adjustment, r.notes,
      ].map(csvCell).join(","));
    }
    csv = lines.join("\n");
  }

  // ---------- PDF ----------
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text(mode === "partner" ? "Payout statement" : "Partner payout report", 40, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
  doc.text("Iskra · WhatsApp Outreach", 40, y + 12); y += 28;

  doc.setTextColor(20); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(partner?.name || "Partner", 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  if (partner?.contact_email) { doc.text(partner.contact_email, 40, y); y += 11; }
  doc.text(`Period: ${run.period_from} -> ${run.period_to}`, 40, y); y += 11;
  if (mode === "internal") {
    doc.text(`Run ID: ${run.id}`, 40, y); y += 11;
  }
  doc.text(`Generated: ${new Date(run.generated_at).toISOString().slice(0, 16).replace("T", " ")} UTC`, 40, y); y += 11;
  doc.text(`Status: ${String(run.status).toUpperCase()}`, 40, y); y += 11;
  if (run.status === "paid" && run.paid_at) {
    doc.text(`Paid on: ${String(run.paid_at).slice(0, 10)}${run.paid_reference ? ` · Ref ${run.paid_reference}` : ""}`, 40, y); y += 11;
  }
  y += 7;

  // Determine the partner rate to show (most-common rate across line items).
  const rateCounts = new Map<number, number>();
  for (const r of (items || []) as any[]) {
    const k = Number(r.partner_rate_usd);
    rateCounts.set(k, (rateCounts.get(k) || 0) + Number(r.delivered || 0));
  }
  let topRate = 0;
  let topCount = -1;
  for (const [k, v] of rateCounts.entries()) {
    if (v > topCount) { topRate = k; topCount = v; }
  }
  const ratesAreUniform = rateCounts.size <= 1;
  const partnerRateLabel = ratesAreUniform ? fmtRate(topRate) : `${fmtRate(topRate)} (mixed)`;

  // Totals box
  doc.setDrawColor(220); doc.setFillColor(248, 248, 245);
  const totalsCells: [string, string][] = mode === "partner"
    ? [
        ["Delivered", String(run.totals_delivered)],
        ["Failed", String(run.totals_failed)],
        ["Partner rate", partnerRateLabel],
        ["Partner payout due", fmtUsd(Number(run.total_payout_usd))],
      ]
    : [
        ["Delivered", String(run.totals_delivered)],
        ["Failed", String(run.totals_failed)],
        ["Sent", String(run.totals_sent)],
        ["Partner payout", fmtUsd(Number(run.total_payout_usd))],
        ["Client billed", fmtUsd(Number(run.total_billed_usd))],
        ["Our margin", fmtUsd(Number(run.margin_usd))],
      ];
  doc.roundedRect(40, y, W - 80, 70, 6, 6, "FD");
  doc.setTextColor(20); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  const cw = (W - 80) / totalsCells.length;
  totalsCells.forEach(([lbl, val], i) => {
    const x = 40 + i * cw + 12;
    doc.setFont("helvetica", "normal"); doc.setTextColor(120); doc.setFontSize(8);
    doc.text(String(lbl), x, y + 22);
    doc.setFont("helvetica", "bold"); doc.setTextColor(20); doc.setFontSize(13);
    doc.text(String(val), x, y + 46);
  });
  y += 88;

  // Per-number summary
  type Roll = { number: string; client: string; delivered: number; failed: number; payout: number; billed: number; margin: number };
  const byNumber = new Map<string, Roll>();
  for (const r of items || []) {
    const k = `${r.whatsapp_number_id}|${r.workspace_id}`;
    const existing = byNumber.get(k) || {
      number: numLabel(r.whatsapp_number_id), client: wsLabel(r.workspace_id),
      delivered: 0, failed: 0, payout: 0, billed: 0, margin: 0,
    };
    existing.delivered += r.delivered; existing.failed += r.failed;
    existing.payout += Number(r.payout_usd);
    existing.billed += Number(r.billed_usd);
    existing.margin += Number(r.margin_usd);
    byNumber.set(k, existing);
  }

  if (mode === "partner") {
    autoTable(doc, {
      startY: y,
      head: [["Number", "Client", "Delivered", "Failed", "Partner payout"]],
      body: Array.from(byNumber.values()).map(r => [r.number, r.client, r.delivered, r.failed, fmtUsd(r.payout)]),
      styles: { font: "helvetica", fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Number", "Client", "Delivered", "Failed", "Partner payout", "Client billed", "Our margin"]],
      body: Array.from(byNumber.values()).map(r => [r.number, r.client, r.delivered, r.failed, fmtUsd(r.payout), fmtUsd(r.billed), fmtUsd(r.margin)]),
      styles: { font: "helvetica", fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 18;

  // Per-day breakdown
  if ((items || []).length) {
    if (y > 700) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
    doc.text("Daily breakdown", 40, y); y += 8;
    if (mode === "partner") {
      autoTable(doc, {
        startY: y,
        head: [["Day", "Number", "Client", "Delivered", "Failed", "Partner rate", "Partner payout"]],
        body: (items || []).map((r: any) => [
          r.day, numLabel(r.whatsapp_number_id), wsLabel(r.workspace_id),
          r.delivered, r.failed, fmtRate(Number(r.partner_rate_usd)), fmtUsd(Number(r.payout_usd)),
        ]),
        styles: { font: "helvetica", fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60], textColor: 255 },
        margin: { left: 40, right: 40 },
      });
    } else {
      autoTable(doc, {
        startY: y,
        head: [["Day", "Number", "Client", "Delivered", "Failed", "Partner rate", "Client rate", "Partner payout"]],
        body: (items || []).map((r: any) => [
          r.day, numLabel(r.whatsapp_number_id), wsLabel(r.workspace_id),
          r.delivered, r.failed, fmtRate(Number(r.partner_rate_usd)), fmtRate(Number(r.client_rate_usd)), fmtUsd(Number(r.payout_usd)),
        ]),
        styles: { font: "helvetica", fontSize: 8 },
        headStyles: { fillColor: [60, 60, 60], textColor: 255 },
        margin: { left: 40, right: 40 },
      });
    }
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Footer
  if (y > 740) { doc.addPage(); y = 48; }
  doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  if (mode === "internal") {
    doc.text(`Verification - source events: ${run.source_event_count}  ·  hash: ${(run.source_data_hash || "-").slice(0, 16)}…`, 40, y); y += 11;
    doc.text(`Rates as of ${new Date(run.generated_at).toISOString()}. Computed from raw provider delivery events.`, 40, y);
  } else {
    doc.text(`Computed from raw provider delivery events. Rates fixed at the moment each message was delivered.`, 40, y); y += 11;
    doc.text(`Questions about this statement? Reply to the email this PDF was sent with.`, 40, y);
  }
  if (run.status === "void") {
    doc.setTextColor(180, 30, 30); doc.setFontSize(36);
    doc.text("VOID", W / 2 - 40, 400);
  }

  const pdfBytes = doc.output("arraybuffer") as ArrayBuffer;

  // ---------- Upload ----------
  const stamp = `${run.period_from}_${run.period_to}_${run.id.slice(0, 8)}`;
  const suffix = mode === "partner" ? "_partner" : "";
  const pdfPath = `${run.partner_id}/${stamp}${suffix}.pdf`;
  const csvPath = `${run.partner_id}/${stamp}${suffix}.csv`;
  await admin.storage.from("payout-reports").upload(pdfPath, new Uint8Array(pdfBytes), {
    contentType: "application/pdf", upsert: true,
  });
  await admin.storage.from("payout-reports").upload(csvPath, new TextEncoder().encode(csv), {
    contentType: "text/csv", upsert: true,
  });

  const updatePatch: Record<string, unknown> = mode === "partner"
    ? { partner_pdf_storage_path: pdfPath }
    : { pdf_storage_path: pdfPath, csv_storage_path: csvPath };
  await admin.from("payout_runs").update(updatePatch).eq("id", run.id);

  const [{ data: pdfUrl }, { data: csvUrl }] = await Promise.all([
    admin.storage.from("payout-reports").createSignedUrl(pdfPath, 60 * 60 * 24),
    admin.storage.from("payout-reports").createSignedUrl(csvPath, 60 * 60 * 24),
  ]);

  return json({ pdf_url: pdfUrl?.signedUrl, csv_url: csvUrl?.signedUrl, pdf_path: pdfPath, csv_path: csvPath, mode });
});
