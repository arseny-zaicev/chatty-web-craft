// Generates a consolidated manager payout PDF for a given manager (a partner who has
// downline partners attached via partners.referrer_partner_id) over a date range.
//
// Sums up:
//   - The manager's own delivered messages × their partner rate (partner payout)
//   - Each downline partner's delivered messages × the downline's manager rate
//     (referral_rate_usd) → manager referral earnings
//
// POST { manager_id: string, period_from: "YYYY-MM-DD", period_to: "YYYY-MM-DD" }
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

const fmtUsd = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRate = (n: number) => `$${Number(n || 0).toFixed(4)}`;

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
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: u.user.id }).single();
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { manager_id?: string; period_from?: string; period_to?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  if (!body.manager_id || !body.period_from || !body.period_to)
    return json({ error: "manager_id, period_from, period_to required" }, 400);

  const { manager_id, period_from, period_to } = body;
  const fromIso = `${period_from}T00:00:00Z`;
  const toIso = new Date(new Date(`${period_to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 1. Manager + downlines
  const { data: manager } = await admin.from("partners").select("*").eq("id", manager_id).single();
  if (!manager) return json({ error: "manager not found" }, 404);

  const { data: downlines } = await admin.from("partners")
    .select("id, name, contact_email, default_payout_rate_usd, referral_rate_usd")
    .eq("referrer_partner_id", manager_id);

  // 2. Pull all delivered events on numbers owned by manager OR any downline in the period.
  // We use the RPC partner_rate_at + number_owner_at logic via a single SQL call:
  // delivered count per partner using number_ownership effective at event time.
  const allPartnerIds = [manager_id, ...((downlines || []).map((d: any) => d.id))];

  const { data: events, error: evErr } = await admin.from("whatsapp_message_events")
    .select("id, event_type, received_at, whatsapp_number_id, workspace_id")
    .gte("received_at", fromIso).lt("received_at", toIso)
    .eq("event_type", "delivered")
    .not("whatsapp_number_id", "is", null);
  if (evErr) return json({ error: evErr.message }, 500);

  // Resolve owners batched
  const numIds = Array.from(new Set((events || []).map((e: any) => e.whatsapp_number_id)));
  const { data: ownerships } = numIds.length
    ? await admin.from("number_ownership").select("whatsapp_number_id, partner_id, effective_from, effective_to")
        .in("whatsapp_number_id", numIds)
    : { data: [] as any[] };

  const ownerOf = (nid: string, at: string): string | null => {
    const candidates = (ownerships || []).filter((o: any) => o.whatsapp_number_id === nid
      && o.effective_from <= at && (!o.effective_to || o.effective_to > at));
    if (!candidates.length) return null;
    candidates.sort((a: any, b: any) => (a.effective_from < b.effective_from ? 1 : -1));
    return candidates[0].partner_id;
  };

  // Aggregate delivered per partner
  const deliveredByPartner = new Map<string, number>();
  for (const e of events || []) {
    const owner = ownerOf(e.whatsapp_number_id, e.received_at);
    if (!owner || !allPartnerIds.includes(owner)) continue;
    deliveredByPartner.set(owner, (deliveredByPartner.get(owner) || 0) + 1);
  }

  // 3. Compute amounts
  const managerOwnDelivered = deliveredByPartner.get(manager_id) || 0;
  const managerOwnRate = Number(manager.default_payout_rate_usd) || 0;
  const managerOwnPayout = managerOwnDelivered * managerOwnRate;

  type DownlineRow = { id: string; name: string; delivered: number; manager_rate: number; manager_payout: number };
  const downlineRows: DownlineRow[] = (downlines || []).map((d: any) => {
    const delivered = deliveredByPartner.get(d.id) || 0;
    const rate = Number(d.referral_rate_usd) || 0;
    return { id: d.id, name: d.name, delivered, manager_rate: rate, manager_payout: delivered * rate };
  });

  const totalManagerPayout = managerOwnPayout + downlineRows.reduce((s, r) => s + r.manager_payout, 0);
  const totalDelivered = managerOwnDelivered + downlineRows.reduce((s, r) => s + r.delivered, 0);

  // 4. PDF
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("Manager payout statement", 40, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
  doc.text("Iskra · WhatsApp Outreach", 40, y + 12); y += 28;

  doc.setTextColor(20); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text(manager.name, 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  if (manager.contact_email) { doc.text(manager.contact_email, 40, y); y += 11; }
  doc.text(`Period: ${period_from} -> ${period_to}`, 40, y); y += 11;
  doc.text(`Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, 40, y); y += 11;
  doc.text(`Team size: ${downlineRows.length} partner(s) + your own`, 40, y); y += 18;

  // Totals box
  doc.setDrawColor(220); doc.setFillColor(248, 248, 245);
  const cells: [string, string][] = [
    ["Total delivered", totalDelivered.toLocaleString()],
    ["Your own payout", fmtUsd(managerOwnPayout)],
    ["Team referral", fmtUsd(totalManagerPayout - managerOwnPayout)],
    ["Total due to you", fmtUsd(totalManagerPayout)],
  ];
  doc.roundedRect(40, y, W - 80, 70, 6, 6, "FD");
  const cw = (W - 80) / cells.length;
  cells.forEach(([lbl, val], i) => {
    const x = 40 + i * cw + 12;
    doc.setFont("helvetica", "normal"); doc.setTextColor(120); doc.setFontSize(8);
    doc.text(lbl, x, y + 22);
    doc.setFont("helvetica", "bold"); doc.setTextColor(20); doc.setFontSize(13);
    doc.text(val, x, y + 46);
  });
  y += 88;

  // Section A - your own
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
  doc.text("Your own numbers", 40, y); y += 8;
  autoTable(doc, {
    startY: y,
    head: [["Delivered", "Partner rate", "Your payout"]],
    body: [[managerOwnDelivered.toLocaleString(), fmtRate(managerOwnRate), fmtUsd(managerOwnPayout)]],
    styles: { font: "helvetica", fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    margin: { left: 40, right: 40 },
  });
  y = (doc as any).lastAutoTable.finalY + 18;

  // Section B - your team
  if (downlineRows.length) {
    if (y > 700) { doc.addPage(); y = 48; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
    doc.text("Your team", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Partner", "Delivered", "Manager rate", "Your referral earnings"]],
      body: downlineRows
        .sort((a, b) => b.manager_payout - a.manager_payout)
        .map(r => [r.name, r.delivered.toLocaleString(), fmtRate(r.manager_rate), fmtUsd(r.manager_payout)]),
      styles: { font: "helvetica", fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      margin: { left: 40, right: 40 },
      foot: [["Team total", "",
        "",
        fmtUsd(downlineRows.reduce((s, r) => s + r.manager_payout, 0)),
      ]],
      footStyles: { fillColor: [240, 240, 235], textColor: 20, fontStyle: "bold" },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Footer
  if (y > 740) { doc.addPage(); y = 48; }
  doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Computed from raw provider delivery events between ${period_from} and ${period_to}.`, 40, y); y += 11;
  doc.text(`Rates fixed per partner profile at the time of generation.`, 40, y);

  const pdfBytes = doc.output("arraybuffer") as ArrayBuffer;

  const stamp = `${period_from}_${period_to}`;
  const pdfPath = `${manager_id}/manager_${stamp}.pdf`;
  await admin.storage.from("payout-reports").upload(pdfPath, new Uint8Array(pdfBytes), {
    contentType: "application/pdf", upsert: true,
  });
  const { data: signed } = await admin.storage.from("payout-reports").createSignedUrl(pdfPath, 60 * 60 * 24);

  return json({
    pdf_url: signed?.signedUrl, pdf_path: pdfPath,
    totals: {
      delivered: totalDelivered,
      own_payout: managerOwnPayout,
      team_referral: totalManagerPayout - managerOwnPayout,
      total_due: totalManagerPayout,
    },
    team: downlineRows.length,
  });
});
