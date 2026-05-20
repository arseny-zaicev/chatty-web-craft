// Posts a payout run summary + PDF link to the internal Slack finance channel.
// POST { run_id: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertPayoutOwnershipClean, formatDriftForSlack } from "../_shared/payoutGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

const fmtUsd = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
  const CHANNEL = Deno.env.get("SLACK_OPS_FINANCE_CHANNEL_ID");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);
  if (!SLACK_API_KEY) return json({ error: "SLACK_API_KEY missing" }, 500);
  if (!CHANNEL) return json({ error: "SLACK_OPS_FINANCE_CHANNEL_ID missing" }, 500);

  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const isServiceCall = req.headers.get("x-internal-cron") === "1";

  const userClient = jwt ? createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  }) : null;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  if (!isServiceCall) {
    if (!userClient) return json({ error: "unauthorized" }, 401);
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: u.user.id }).single();
    if (!isAdmin) return json({ error: "forbidden" }, 403);
  }

  let body: { run_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid body" }, 400); }
  if (!body.run_id) return json({ error: "run_id required" }, 400);

  const { data: run, error: runErr } = await admin.from("payout_runs").select("*").eq("id", body.run_id).single();
  if (runErr || !run) return json({ error: "run not found" }, 404);
  const { data: partner } = await admin.from("partners").select("name").eq("id", run.partner_id).single();

  // Ensure PDF exists
  let pdfPath: string | null = run.pdf_storage_path;
  if (!pdfPath) {
    const r = await admin.functions.invoke("payout-report-pdf", {
      body: { run_id: run.id },
      headers: { Authorization: `Bearer ${SERVICE}` },
    });
    if (r.error) return json({ error: `pdf gen failed: ${r.error.message}` }, 500);
    pdfPath = (r.data as any)?.pdf_path || null;
    if (pdfPath) {
      await admin.from("payout_runs").update({ pdf_storage_path: pdfPath }).eq("id", run.id);
    }
  }
  let pdfUrl: string | null = null;
  if (pdfPath) {
    const { data: signed } = await admin.storage.from("payout-reports").createSignedUrl(pdfPath, 60 * 60 * 24 * 7);
    pdfUrl = signed?.signedUrl || null;
  }

  const cadenceLabel = run.cadence === "weekly" ? "Weekly" : run.cadence === "monthly" ? "Monthly" : "Manual";
  const roleLabel = run.role ? ` (${run.role})` : "";
  const text = `:moneybag: ${cadenceLabel} payout - *${partner?.name || "Partner"}${roleLabel}* - ${run.period_from} → ${run.period_to}\nDelivered ${run.totals_delivered} · Payout ${fmtUsd(Number(run.total_payout_usd))} · Status ${String(run.status).toUpperCase()}${pdfUrl ? `\n<${pdfUrl}|Download PDF>` : ""}`;

  const slackRes = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": SLACK_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: CHANNEL, text, unfurl_links: false }),
  });
  const slackData = await slackRes.json();
  if (!slackData.ok) return json({ error: `slack: ${slackData.error || "failed"}` }, 502);

  await admin.from("payout_runs").update({
    slack_channel_id: CHANNEL,
    slack_message_ts: slackData.ts,
  }).eq("id", run.id);

  return json({ ok: true, ts: slackData.ts, pdf_url: pdfUrl });
});
