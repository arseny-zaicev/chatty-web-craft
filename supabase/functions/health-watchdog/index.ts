// Watchdog: detects stalls in the lead delivery pipeline and alerts Slack.
// Runs on cron (every 5 minutes). Idempotent — uses a debounce table to avoid spam.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { postSlack } from "../_shared/slackBlocks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_CHANNEL = "delivery-leads";
const STALE_SYNC_MIN = 10;       // alert if no successful sheets sync in N min
const STALE_DISPATCH_MIN = 10;   // alert if pending leads older than N min not dispatched
const ALERT_DEBOUNCE_MIN = 30;   // don't repeat the same alert for N min

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const alerts: { kind: string; text: string }[] = [];

  // 1) Surface persistent sync errors
  const { data: sheets } = await supabase
    .from("source_connections")
    .select("id,name,last_error,last_ingest_at,created_at")
    .eq("kind", "google_sheet")
    .eq("status", "active");
  const errored = (sheets ?? []).filter((s) => s.last_error);
  if (errored.length > 0) {
    alerts.push({
      kind: "sheets_sync_error",
      text: `:rotating_light: Google Sheets sync errors on ${errored.length} source(s): ${errored.map((s) => `${s.name}: ${s.last_error}`).join(" | ")}`,
    });
  }

  const staleCutoff = Date.now() - STALE_SYNC_MIN * 60_000;
  const staleSheets = (sheets ?? []).filter((s) => {
    const baseline = s.last_ingest_at || s.created_at;
    return baseline && new Date(baseline).getTime() < staleCutoff;
  });
  if (staleSheets.length > 0) {
    alerts.push({
      kind: "sheets_sync_stale",
      text: `:rotating_light: Google Sheets sync stalled — no successful sync in ${STALE_SYNC_MIN}m for ${staleSheets.length} active source(s): ${staleSheets.map((s) => `${s.name}: ${s.last_ingest_at ?? "never"}`).join(" | ")}`,
    });
  }

  // 2) Pending leads piling up
  const { count: pendingOld } = await supabase
    .from("lead_imports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("imported_at", new Date(Date.now() - STALE_DISPATCH_MIN * 60_000).toISOString());
  if ((pendingOld ?? 0) > 0) {
    alerts.push({
      kind: "leads_pending_backlog",
      text: `:warning: ${pendingOld} lead(s) stuck in 'pending' for >${STALE_DISPATCH_MIN}m. Dispatch pipeline may be down.`,
    });
  }

  // 3) Queued leads not sent
  const { count: queuedOld } = await supabase
    .from("lead_imports")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lt("imported_at", new Date(Date.now() - STALE_DISPATCH_MIN * 60_000).toISOString());
  if ((queuedOld ?? 0) > 0) {
    alerts.push({
      kind: "leads_queued_backlog",
      text: `:warning: ${queuedOld} lead(s) stuck in 'queued' for >${STALE_DISPATCH_MIN}m. WhatsApp send pipeline may be blocked.`,
    });
  }

  // Debounce via system_alerts table
  const fired: string[] = [];
  for (const a of alerts) {
    const { data: last } = await supabase
      .from("system_alerts")
      .select("last_sent_at")
      .eq("kind", a.kind)
      .maybeSingle();
    const now = Date.now();
    if (last?.last_sent_at && now - new Date(last.last_sent_at).getTime() < ALERT_DEBOUNCE_MIN * 60_000) {
      continue;
    }
    try {
      await postSlack(ALERT_CHANNEL, {
        text: a.text,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: a.text } }],
      });
      fired.push(a.kind);
      await supabase.from("system_alerts").upsert({ kind: a.kind, last_sent_at: new Date().toISOString() });
    } catch (e) {
      console.error("alert post failed", a.kind, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: alerts.length, fired }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
