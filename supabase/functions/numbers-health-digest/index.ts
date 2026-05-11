// Posts a fleet-wide health digest to Slack on a schedule.
// Diffs the current snapshot against `fleet_health_snapshots`. Posts only if
// something changed OR if any number is in a non-healthy state. Stores the new
// snapshot. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { postSlack } from "../_shared/slackBlocks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_CHANNEL = Deno.env.get("SLACK_OPS_NUMBERS_CHANNEL_ID") || "numbers-health";

type N = {
  id: string;
  phone_number: string;
  label: string | null;
  status: string;
  quality_rating: string | null;
  messaging_limit: string | null;
  workspace_id: string | null;
  last_health_sync_at: string | null;
  last_health_sync_error: string | null;
};

function bucket<T extends string | null>(arr: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of arr) {
    const k = (v ?? "unknown") as string;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let force = false;
  if (req.method === "POST") {
    try { const b = await req.json(); force = !!b?.force; } catch { /* ignore */ }
  }

  const { data: numbers, error } = await supabase
    .from("whatsapp_numbers")
    .select("id, phone_number, label, status, quality_rating, messaging_limit, workspace_id, last_health_sync_at, last_health_sync_error")
    .eq("is_active", true);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const nums = (numbers || []) as N[];

  const byStatus = bucket(nums.map((n) => n.status));
  const byQuality = bucket(nums.map((n) => (n.quality_rating || null)));
  const byTier = bucket(nums.map((n) => (n.messaging_limit || null)));

  const summary = {
    total: nums.length,
    by_status: byStatus,
    by_quality: byQuality,
    by_tier: byTier,
    sync_failed: nums.filter((n) => !!n.last_health_sync_error).length,
    captured_at: new Date().toISOString(),
  };

  // Fetch previous snapshot for diff
  const { data: prevRow } = await supabase
    .from("fleet_health_snapshots")
    .select("summary, captured_at")
    .eq("id", 1)
    .maybeSingle();
  const prev = (prevRow?.summary as typeof summary | undefined) || null;

  // Per-number changes vs previous detail (we keep last per-number snapshot too)
  const prevByNumber: Record<string, { status: string; quality: string | null; tier: string | null }> = (prev as any)?.by_number || {};
  const byNumber: Record<string, { status: string; quality: string | null; tier: string | null; phone: string; label: string | null }> = {};
  for (const n of nums) {
    byNumber[n.id] = { status: n.status, quality: n.quality_rating || null, tier: n.messaging_limit || null, phone: n.phone_number, label: n.label };
  }

  // Per-number diff vs last snapshot.
  // We only care about regressions on previously-healthy numbers + sync failures.
  // We deliberately do NOT report static counts of restricted/banned numbers -
  // those are already known and create noise.
  const HEALTHY = new Set(["active", "ready", "warming"]);
  const QUALITY_RANK: Record<string, number> = { green: 3, yellow: 2, red: 1 };

  type Regression = { who: string; kind: "broke" | "quality_dropped" | "recovered"; from: string; to: string };
  const regressions: Regression[] = [];

  for (const [id, cur] of Object.entries(byNumber)) {
    const prevN = prevByNumber[id];
    if (!prevN) continue;
    const who = cur.label ? `${cur.label} (+${cur.phone})` : `+${cur.phone}`;

    // Status regression: was healthy, now not
    if (prevN.status !== cur.status) {
      const wasHealthy = HEALTHY.has(prevN.status);
      const isHealthy = HEALTHY.has(cur.status);
      if (wasHealthy && !isHealthy) {
        regressions.push({ who, kind: "broke", from: prevN.status, to: cur.status });
      } else if (!wasHealthy && isHealthy) {
        regressions.push({ who, kind: "recovered", from: prevN.status, to: cur.status });
      }
      continue;
    }
    // Quality drop on a healthy number
    if (HEALTHY.has(cur.status) && (prevN.quality || "") !== (cur.quality || "")) {
      const prevRank = QUALITY_RANK[prevN.quality || ""] ?? 0;
      const curRank = QUALITY_RANK[cur.quality || ""] ?? 0;
      if (curRank > 0 && curRank < prevRank) {
        regressions.push({ who, kind: "quality_dropped", from: prevN.quality || "—", to: cur.quality || "—" });
      }
    }
  }

  const shouldPost = force || regressions.length > 0 || summary.sync_failed > 0;

  // Persist new snapshot regardless (so next diff is correct)
  await supabase.from("fleet_health_snapshots").upsert({
    id: 1,
    captured_at: summary.captured_at,
    summary: { ...summary, by_number: byNumber },
  });

  if (!shouldPost) {
    return new Response(JSON.stringify({ ok: true, posted: false, reason: "no regressions" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Slack message: only what changed on working numbers + sync failures.
  const lines: string[] = [];
  const broke = regressions.filter((r) => r.kind === "broke");
  const dropped = regressions.filter((r) => r.kind === "quality_dropped");
  const recovered = regressions.filter((r) => r.kind === "recovered");

  if (broke.length > 0) {
    lines.push(`:rotating_light: *${broke.length} number(s) stopped working:*`);
    for (const r of broke.slice(0, 12)) lines.push(`• ${r.who}: ${r.from} → *${r.to}*`);
    if (broke.length > 12) lines.push(`_+${broke.length - 12} more_`);
  }
  if (dropped.length > 0) {
    if (lines.length) lines.push("");
    lines.push(`:warning: *${dropped.length} number(s) - quality dropped:*`);
    for (const r of dropped.slice(0, 12)) lines.push(`• ${r.who}: quality ${r.from} → *${r.to}*`);
  }
  if (recovered.length > 0) {
    if (lines.length) lines.push("");
    lines.push(`:white_check_mark: *${recovered.length} number(s) recovered:*`);
    for (const r of recovered.slice(0, 12)) lines.push(`• ${r.who}: ${r.from} → *${r.to}*`);
  }
  if (summary.sync_failed > 0) {
    if (lines.length) lines.push("");
    lines.push(`:rotating_light: Health sync is failing for *${summary.sync_failed}* number(s) - cannot read their status from Gupshup.`);
  }

  const text = lines.join("\n") || "Fleet health digest (forced) - no regressions.";
  await postSlack(ALERT_CHANNEL, {
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  });

  return new Response(JSON.stringify({ ok: true, posted: true, regressions: regressions.length, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
