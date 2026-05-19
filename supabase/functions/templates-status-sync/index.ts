// Auto-sync Gupshup template statuses for every active number in the fleet.
// Detects status transitions (pending -> approved/rejected/paused) and posts
// a per-workspace digest to Slack #ops-campaigns. Designed to be called by
// pg_cron every hour 09:00-21:00 Asia/Dubai.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSlackMessage } from "../_shared/slack.ts";
import { cronGuard } from "../_shared/cronGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readJson(res: Response) { return await res.json().catch(() => ({})); }

function extractGupshupTemplates(payload: any): any[] {
  const candidates = [payload?.templates, payload?.data?.templates, payload?.data, payload?.results, payload?.templateList];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

async function getGupshupAppToken(appId: string, partnerToken: string) {
  const attempts = [
    { Authorization: partnerToken, accept: "application/json" },
    { token: partnerToken, accept: "application/json" },
  ];
  for (const headers of attempts) {
    const res = await fetch(`https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/token/`, { headers });
    const payload = await readJson(res);
    const token = typeof payload?.token?.token === "string" ? payload.token.token : typeof payload?.token === "string" ? payload.token : "";
    if (res.ok && token) return token;
  }
  return "";
}

async function fetchGupshupTemplates(appId: string, configuredToken: string): Promise<any[]> {
  const tryFetch = async (token: string) => {
    const res = await fetch(`https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/templates`, {
      headers: { Authorization: token, token, accept: "application/json" },
    });
    const p = await readJson(res);
    if (res.ok && p?.status !== "error") return extractGupshupTemplates(p);
    return null;
  };
  let templates = await tryFetch(configuredToken);
  if (templates) return templates;
  const appToken = await getGupshupAppToken(appId, configuredToken);
  if (appToken) {
    templates = await tryFetch(appToken);
    if (templates) return templates;
  }
  const directRes = await fetch(`https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`, {
    headers: { apikey: configuredToken, accept: "application/json" },
  });
  const direct = await readJson(directRes);
  if (directRes.ok && direct?.status !== "error") return extractGupshupTemplates(direct);
  throw new Error("Gupshup template fetch failed");
}

function normalizeStatus(raw: string): "approved" | "rejected" | "paused" | "pending" {
  const s = String(raw || "PENDING").toUpperCase();
  if (s === "APPROVED" || s === "ENABLED") return "approved";
  if (s === "REJECTED" || s === "FAILED") return "rejected";
  if (s === "PAUSED" || s === "DISABLED") return "paused";
  return "pending";
}

const STATUS_EMOJI: Record<string, string> = {
  approved: "✅", rejected: "❌", paused: "⏸️", pending: "⏳",
};

type NumberRow = {
  id: string;
  workspace_id: string | null;
  phone_number: string;
  display_name: string | null;
  provider_app_id: string | null;
  provider_api_key: string | null;
};

type Change = { name: string; from: string; to: string };
type NumberDiff = {
  number: NumberRow;
  changes: Change[];
  totals: { approved: number; rejected: number; paused: number; pending: number };
  notifyIds: string[];
};

serve(cronGuard("templates-status-sync", async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const body = await req.json().catch(() => ({}));
  const dryRun = !!body?.dry_run;
  const limitWorkspace = body?.workspace_id ? String(body.workspace_id) : null;

  // 1) Active numbers with provider config
  let q = admin
    .from("whatsapp_numbers")
    .select("id, workspace_id, phone_number, display_name, provider_app_id, provider_api_key")
    .eq("is_active", true)
    .not("provider_app_id", "is", null);
  if (limitWorkspace) q = q.eq("workspace_id", limitWorkspace);
  const { data: numbers, error: numErr } = await q;
  if (numErr) return json({ error: numErr.message }, 500);
  const numList = (numbers ?? []) as NumberRow[];
  if (numList.length === 0) return json({ ok: true, numbers: 0, changes: 0 });

  const fallbackKey = Deno.env.get("GUPSHUP_API_KEY") ?? "";

  // Group diffs by workspace
  const perWorkspace: Map<string, NumberDiff[]> = new Map();
  let totalChanges = 0;
  let failedNumbers = 0;

  for (const n of numList) {
    const apiKey = n.provider_api_key || fallbackKey;
    if (!apiKey || !n.provider_app_id) continue;

    // Snapshot current statuses + last_notified_status for diff baseline
    const { data: existing } = await admin
      .from("message_templates")
      .select("id, name, language, status, last_notified_status")
      .eq("whatsapp_number_id", n.id);
    const baselineMap = new Map<string, { id: string; baseline: string; current: string }>();
    for (const t of existing ?? []) {
      // Diff against last_notified_status (fallback to status for legacy rows).
      baselineMap.set(`${t.name}::${t.language}`, {
        id: t.id,
        baseline: (t as any).last_notified_status ?? t.status,
        current: t.status,
      });
    }

    // Fetch from Gupshup
    let remote: any[];
    try {
      remote = await fetchGupshupTemplates(n.provider_app_id, apiKey);
    } catch (e) {
      failedNumbers++;
      console.warn(`Sync failed for ${n.phone_number}:`, e instanceof Error ? e.message : e);
      continue;
    }

    const changes: Change[] = [];
    const totals = { approved: 0, rejected: 0, paused: 0, pending: 0 };
    const rowUpdates: Array<{ id: string; status: string }> = [];
    const notifyIds: string[] = []; // rows whose last_notified_status we'll bump after Slack succeeds

    for (const t of remote) {
      const name = String(t.elementName || t.name || "").trim().slice(0, 120);
      if (!name) continue;
      const language = String(t.languageCode || t.language || "en").trim().slice(0, 16);
      const status = normalizeStatus(t.status);
      totals[status]++;
      const key = `${name}::${language}`;
      const base = baselineMap.get(key);
      if (!base) continue;
      // Always stamp synced_at for every template verified against Gupshup.
      // If status drifted, update status in the same write.
      rowUpdates.push({ id: base.id, status });
      // Only flag as a notifiable change if it differs from last notified baseline
      if (base.baseline !== status) {
        changes.push({ name, from: base.baseline, to: status });
        notifyIds.push(base.id);
      }
    }

    if (!dryRun && rowUpdates.length > 0) {
      const syncedAt = new Date().toISOString();
      for (const u of rowUpdates) {
        await admin
          .from("message_templates")
          .update({ status: u.status, synced_at: syncedAt })
          .eq("id", u.id);
      }
    }

    if (changes.length > 0) {
      totalChanges += changes.length;
      const wsId = n.workspace_id ?? "unassigned";
      const arr = perWorkspace.get(wsId) ?? [];
      arr.push({ number: n, changes, totals, notifyIds });
      perWorkspace.set(wsId, arr);
    }
  }

  // 2) Slack digest per workspace
  const slackChannel = Deno.env.get("SLACK_OPS_CAMPAIGNS_CHANNEL_ID");
  const appBase = Deno.env.get("APP_BASE_URL") ?? "https://iskra.ae";
  if (!dryRun && slackChannel && perWorkspace.size > 0) {
    // Fetch workspace names
    const wsIds = [...perWorkspace.keys()].filter((k) => k !== "unassigned");
    const { data: workspaces } = wsIds.length > 0
      ? await admin.from("workspaces").select("id, name").in("id", wsIds)
      : { data: [] as { id: string; name: string }[] };
    const wsName = new Map<string, string>();
    for (const w of workspaces ?? []) wsName.set(w.id, w.name);

    for (const [wsId, diffs] of perWorkspace.entries()) {
      const clientName = wsId === "unassigned" ? "Unassigned numbers" : (wsName.get(wsId) ?? "Workspace");
      const lines: string[] = [];
      lines.push(`*Templates updated · ${clientName}*`);
      const grand = { approved: 0, rejected: 0, paused: 0, pending: 0 };
      const idsToBump: string[] = [];
      for (const d of diffs) {
        const phone = d.number.display_name || `+${d.number.phone_number}`;
        const changeBits = d.changes
          .map((c) => `${STATUS_EMOJI[c.to] ?? ""} \`${c.name}\` ${c.from} → *${c.to}*`)
          .join(", ");
        lines.push(`• ${phone} - ${changeBits}`);
        lines.push(`    _now: ${d.totals.approved} approved · ${d.totals.pending} pending · ${d.totals.rejected} rejected · ${d.totals.paused} paused_`);
        grand.approved += d.totals.approved;
        grand.rejected += d.totals.rejected;
        grand.paused += d.totals.paused;
        grand.pending += d.totals.pending;
        idsToBump.push(...d.notifyIds);
      }
      lines.push(`Total across affected numbers: *${grand.approved} approved* · ${grand.pending} pending · ${grand.rejected} rejected · ${grand.paused} paused`);
      lines.push(`<${appBase}/admin/fleet|Open Fleet →>`);
      try {
        await sendSlackMessage(slackChannel, lines.join("\n"));
        // Only bump last_notified_status after Slack confirms — failure leaves diff for next run.
        if (idsToBump.length > 0) {
          // Fetch current statuses to align last_notified_status with what we actually told Slack.
          const { data: cur } = await admin
            .from("message_templates")
            .select("id, status")
            .in("id", idsToBump);
          for (const row of cur ?? []) {
            await admin
              .from("message_templates")
              .update({ last_notified_status: row.status })
              .eq("id", row.id);
          }
        }
      } catch (e) {
        console.warn(`Slack post failed for workspace ${wsId}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  return json({
    ok: true,
    numbers: numList.length,
    failed_numbers: failedNumbers,
    workspaces_notified: perWorkspace.size,
    total_changes: totalChanges,
    dry_run: dryRun,
}));
});
