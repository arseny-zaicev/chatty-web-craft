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

const ALERT_CHANNEL = Deno.env.get("SLACK_OPS_NUMBERS_CHANNEL_ID") || "delivery-leads";

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

  const changes: string[] = [];
  for (const [id, cur] of Object.entries(byNumber)) {
    const prevN = prevByNumber[id];
    if (!prevN) continue;
    const who = cur.label ? `${cur.label} (+${cur.phone})` : `+${cur.phone}`;
    if (prevN.status !== cur.status) changes.push(`${who}: status ${prevN.status} → *${cur.status}*`);
    else if ((prevN.quality || "") !== (cur.quality || "")) changes.push(`${who}: quality ${prevN.quality || "—"} → *${cur.quality || "—"}*`);
    else if ((prevN.tier || "") !== (cur.tier || "")) changes.push(`${who}: tier ${prevN.tier || "—"} → *${cur.tier || "—"}*`);
  }

  const nonHealthy = (byStatus["restricted"] || 0) + (byStatus["banned"] || 0) + (byStatus["blocked"] || 0);
  const shouldPost = force || changes.length > 0 || nonHealthy > 0 || summary.sync_failed > 0;

  // Persist new snapshot regardless (so next diff is correct)
  await supabase.from("fleet_health_snapshots").upsert({
    id: 1,
    captured_at: summary.captured_at,
    summary: { ...summary, by_number: byNumber },
  });

  if (!shouldPost) {
    return new Response(JSON.stringify({ ok: true, posted: false, reason: "no changes, all healthy" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build Slack message
  const fmtBucket = (b: Record<string, number>) =>
    Object.entries(b).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(" · ") || "—";

  const lines = [
    `*Fleet health digest*`,
    `• Total active: *${summary.total}*`,
    `• Status: ${fmtBucket(byStatus)}`,
    `• Quality: ${fmtBucket(byQuality)}`,
    `• Tier: ${fmtBucket(byTier)}`,
  ];
  if (summary.sync_failed > 0) {
    lines.push(`• :rotating_light: Sync failed for *${summary.sync_failed}* number(s)`);
  }
  if (changes.length > 0) {
    lines.push("");
    lines.push(`*Changes since last digest (${changes.length}):*`);
    for (const c of changes.slice(0, 12)) lines.push(`• ${c}`);
    if (changes.length > 12) lines.push(`_+${changes.length - 12} more_`);
  } else if (nonHealthy > 0) {
    lines.push("");
    lines.push(`_No changes since last digest, but ${nonHealthy} number(s) still in non-healthy state._`);
  }

  const text = lines.join("\n");
  await postSlack(ALERT_CHANNEL, {
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  });

  return new Response(JSON.stringify({ ok: true, posted: true, changes: changes.length, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
