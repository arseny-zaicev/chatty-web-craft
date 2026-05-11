// Watchdog: detects stalls in the lead delivery pipeline and alerts Slack.
// Runs on cron (every 3-5 minutes). Idempotent — uses a debounce table to avoid spam.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { postSlack } from "../_shared/slackBlocks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_CHANNEL = "delivery-leads";
const STALE_SYNC_MIN = 10;          // alert if no successful sheets sync in N min
const STALE_DISPATCH_MIN = 10;      // alert if pending leads older than N min not dispatched
const ALERT_DEBOUNCE_MIN = 30;      // don't repeat the same alert for N min

// Heartbeat freshness expectations (minutes). 2x the cron interval.
// Only include functions that run on a fixed schedule (not on-demand ones like `campaigns`).
const HEARTBEAT_MAX_AGE_MIN: Record<string, number> = {
  "lead-dispatch": 5,
  "google-sheets-sync": 6,
  "health-watchdog": 12,
};
const INBOUND_SILENCE_MIN = 90; // widened to avoid off-peak false positives

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const alerts: { kind: string; text: string }[] = [];

  try {
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
        text: `:rotating_light: Google Sheets sync stalled — no successful sync in ${STALE_SYNC_MIN}m for ${staleSheets.length} active source(s): ${staleSheets.map((s) => `${s.name}: ${s.last_ingest_at ?? "never"}`).join(" | ")}\n\n_Hint: check edge logs for google-sheets-sync, and Cloud cron job status._`,
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
        text: `:warning: ${pendingOld} lead(s) stuck in 'pending' for >${STALE_DISPATCH_MIN}m. Dispatch pipeline may be down.\n\n_Hint: check edge logs for lead-dispatch._`,
      });
    }

    // 3) Queued leads not sent (excluding ones intentionally scheduled in the future)
    const { count: queuedOld } = await supabase
      .from("lead_imports")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .lt("imported_at", new Date(Date.now() - STALE_DISPATCH_MIN * 60_000).toISOString())
      .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);
    if ((queuedOld ?? 0) > 0) {
      alerts.push({
        kind: "leads_queued_backlog",
        text: `:warning: ${queuedOld} lead(s) stuck in 'queued' for >${STALE_DISPATCH_MIN}m (and scheduled_at already passed). WhatsApp send pipeline may be blocked.\n\n_Hint: check campaigns function and Gupshup status._`,
      });
    }

    // 4) Cron heartbeat checks
    const { data: hb } = await supabase
      .from("system_heartbeats")
      .select("name,last_run_at");
    const hbMap = new Map((hb ?? []).map((h: any) => [h.name, h.last_run_at]));
    const stalledCrons: string[] = [];
    for (const [name, maxMin] of Object.entries(HEARTBEAT_MAX_AGE_MIN)) {
      const ts = hbMap.get(name);
      if (!ts) {
        stalledCrons.push(`${name}: never`);
        continue;
      }
      const ageMin = (Date.now() - new Date(ts).getTime()) / 60_000;
      if (ageMin > maxMin) {
        stalledCrons.push(`${name}: ${Math.round(ageMin)}m ago`);
      }
    }
    if (stalledCrons.length > 0) {
      alerts.push({
        kind: "cron_heartbeat_stale",
        text: `:rotating_light: Cron heartbeat stalled: ${stalledCrons.join(" | ")}.\n\n_Hint: check pg_cron jobs (SELECT * FROM cron.job_run_details ORDER BY start_time DESC) and Supabase status._`,
      });
    }

    // 5) Inbound webhook silence (no inbound msg in last INBOUND_SILENCE_MIN min while we have active numbers)
    const { count: activeNumCount } = await supabase
      .from("whatsapp_numbers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .in("status", ["active", "ready"]);
    if ((activeNumCount ?? 0) > 0) {
      const { count: recentInbound } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", new Date(Date.now() - INBOUND_SILENCE_MIN * 60_000).toISOString());
      if ((recentInbound ?? 0) === 0) {
        alerts.push({
          kind: "inbound_silence",
          text: `:eyes: *Webhook* — no inbound WhatsApp replies received in last ${INBOUND_SILENCE_MIN}m across ${activeNumCount} active number(s).\n\n*This does NOT mean lead imports are broken* — it only tracks _inbound replies from contacts_. If lead ingestion was failing you'd see a separate \`leads_pending_backlog\` / \`sheets_sync_*\` alert.\n\nLikely causes (in order): (1) genuinely quiet hour for the audience, (2) Gupshup webhook misconfigured for this number, (3) our \`whatsapp-webhook\` handler crashing.\n\n_Hint: check edge-logs of \`whatsapp-webhook\` — if requests are arriving it's quiet hours; if zero requests, re-register via \`gupshup-set-callback\`._`,
        });
      }
    }

    // 6) Pipeline routing mismatch (conversations with NULL pipeline that should have one)
    const { data: routingMismatch } = await supabase
      .from("conversations")
      .select("id,contact_phone,workspace_id")
      .is("pipeline_id", null)
      .gte("updated_at", new Date(Date.now() - 60 * 60_000).toISOString())
      .limit(20);
    if (routingMismatch && routingMismatch.length > 0) {
      const phones = routingMismatch.map((c: any) => c.contact_phone);
      const { data: hasRecipient } = await supabase
        .from("campaign_recipients")
        .select("contact_phone")
        .in("contact_phone", phones)
        .limit(50);
      const phonesWithRec = new Set((hasRecipient ?? []).map((r: any) => r.contact_phone));
      const broken = routingMismatch.filter((c: any) => phonesWithRec.has(c.contact_phone));
      if (broken.length > 0) {
        alerts.push({
          kind: "pipeline_routing_mismatch",
          text: `:warning: ${broken.length} active conversation(s) have NULL pipeline_id but DO have a campaign recipient. Inbound trigger may have missed them. Conv IDs: ${broken.slice(0, 5).map((c: any) => c.id).join(", ")}`,
        });
      }
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

    // Self-heartbeat
    await supabase.from("system_heartbeats").upsert({
      name: "health-watchdog",
      last_run_at: new Date().toISOString(),
      payload: { checked: alerts.length, fired },
    });

    return new Response(JSON.stringify({ ok: true, checked: alerts.length, fired }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Self-error alert
    const errText = e instanceof Error ? e.message : String(e);
    console.error("watchdog self-error", errText);
    try {
      await postSlack(ALERT_CHANNEL, {
        text: `:rotating_light: health-watchdog itself crashed: ${errText}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `:rotating_light: health-watchdog crashed: \`${errText}\`` } }],
      });
    } catch (_) { /* swallow */ }
    return new Response(JSON.stringify({ ok: false, error: errText }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
