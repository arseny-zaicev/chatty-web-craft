// Hourly regression probe: detects drift between lagging campaign counters
// and the canonical truth layer (campaign_metrics_for_range), plus a few
// other invariants. Posts to slack_event_queue when thresholds are breached.
// Always writes a heartbeat so we can see it ran.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Finding = { kind: string; severity: "warn" | "alert"; text: string; data?: unknown };

Deno.serve(cronGuard("regression-probe", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const findings: Finding[] = [];
  const now = new Date();
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last6hStart = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  // 1) Drift: campaigns.sent_count/failed_count vs canonical truth over last 24h
  try {
    const { data: cs } = await admin
      .from("campaigns")
      .select("id, name, sent_count, failed_count")
      .gte("updated_at", last24hStart)
      .in("status", ["running", "scheduled", "completed", "paused"])
      .limit(500);

    const ids = (cs ?? []).map((c) => c.id);
    if (ids.length > 0) {
      const { data: truth } = await admin.rpc("campaign_metrics_for_range", {
        p_campaign_ids: ids,
        _from: last24hStart,
        _to: now.toISOString(),
      });
      const byId = new Map<string, { sent: number; failed: number }>();
      for (const t of (truth ?? []) as Array<{ campaign_id: string; sent: number; failed: number }>) {
        byId.set(t.campaign_id, { sent: t.sent, failed: t.failed });
      }
      const drift: Array<{ id: string; name: string; lagging: number; canonical: number; diff: number; field: string }> = [];
      for (const c of cs ?? []) {
        const t = byId.get(c.id) ?? { sent: 0, failed: 0 };
        const lagSent = c.sent_count ?? 0;
        const lagFailed = c.failed_count ?? 0;
        const diffSent = Math.abs(lagSent - t.sent);
        const diffFailed = Math.abs(lagFailed - t.failed);
        const thr = (n: number) => Math.max(50, Math.floor(n * 0.1));
        if (diffSent > thr(lagSent)) drift.push({ id: c.id, name: c.name, lagging: lagSent, canonical: t.sent, diff: diffSent, field: "sent" });
        if (diffFailed > thr(lagFailed)) drift.push({ id: c.id, name: c.name, lagging: lagFailed, canonical: t.failed, diff: diffFailed, field: "failed" });
      }
      if (drift.length > 0) {
        findings.push({
          kind: "campaign_counter_drift_24h",
          severity: "alert",
          text: `:rotating_light: ${drift.length} campaign(s) with stats drift >max(50, 10%) between lagging counters and canonical truth in the last 24h. Top: ${drift.slice(0, 5).map((d) => `${d.name} ${d.field} ${d.lagging}→${d.canonical}`).join(" | ")}`,
          data: drift.slice(0, 20),
        });
      }
    }
  } catch (e) {
    findings.push({ kind: "probe_error_campaign_drift", severity: "warn", text: `probe error: ${(e as Error).message}` });
  }

  // 2) provider_message_id coverage on whatsapp_message_events in last 6h
  try {
    const { count: totalEvents } = await admin
      .from("whatsapp_message_events")
      .select("id", { count: "exact", head: true })
      .gte("received_at", last6hStart);
    const { count: missing } = await admin
      .from("whatsapp_message_events")
      .select("id", { count: "exact", head: true })
      .gte("received_at", last6hStart)
      .is("provider_message_id", null);
    if ((totalEvents ?? 0) > 0) {
      const pct = ((missing ?? 0) / totalEvents!) * 100;
      if (pct > 0.5) {
        findings.push({
          kind: "missing_provider_message_id_6h",
          severity: "alert",
          text: `:rotating_light: ${missing} of ${totalEvents} events missing provider_message_id in last 6h (${pct.toFixed(2)}%). Canonical truth de-dupes on this key.`,
        });
      }
    }
  } catch (e) {
    findings.push({ kind: "probe_error_pmi", severity: "warn", text: `probe error: ${(e as Error).message}` });
  }

  // 3) Stuck 'sending' recipients older than 10 min
  try {
    const cutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const { count: stuck } = await admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("status", "sending")
      .lt("updated_at", cutoff);
    if ((stuck ?? 0) > 0) {
      findings.push({
        kind: "stuck_sending_recipients",
        severity: "warn",
        text: `:warning: ${stuck} recipient(s) stuck in 'sending' >10m. Dispatcher claim may be leaking.`,
      });
    }
  } catch (e) {
    findings.push({ kind: "probe_error_stuck_sending", severity: "warn", text: `probe error: ${(e as Error).message}` });
  }

  // Enqueue findings (Slack worker will deliver). Always upsert heartbeat.
  for (const f of findings) {
    try {
      await admin.from("slack_event_queue").insert({
        event_type: f.kind,
        payload: { text: f.text, severity: f.severity, data: f.data ?? null, source: "regression-probe" },
      });
    } catch { /* ignore: queue table may not exist in some envs */ }
  }
  try {
    await admin.from("system_heartbeats").upsert({
      name: "regression-probe",
      last_run_at: now.toISOString(),
      payload: { findings: findings.length },
    });
  } catch { /* ignore */ }

  return new Response(JSON.stringify({ ok: true, findings: findings.length, details: findings }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}));
