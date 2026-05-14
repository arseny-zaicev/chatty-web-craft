// campaign-overflow-rebalance
//
// Safety-net cron (every 30 min). Finds clusters of campaign_recipients where
// >= THRESHOLD rows share the same scheduled_at second — a fingerprint of the
// historical endUtc-clamp bug or any future regression that piles tail-end
// recipients into a single instant. Respreads them linearly across a safe
// 8-hour US business window starting from the next 10:00 local boundary
// (10:00-18:00 ET = 14:00-22:00 UTC), with light jitter.
//
// Posts a single Slack digest line per run when work was done.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acquireJobLock } from "../_shared/jobLock.ts";
import { sendSlackMessage, SLACK_BOOKINGS_CHANNEL } from "../_shared/slack.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLUSTER_THRESHOLD = 50; // rows sharing one second
const WINDOW_HOURS = 8;       // spread across 8h
const JITTER_SEC = 30;

function nextBusinessWindowStartUtc(): Date {
  // Aim for the next 10:00 ET (= 14:00 UTC during EDT, 15:00 UTC during EST).
  // Simple heuristic: 14:00 UTC today if still ahead, otherwise +1 day.
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0,
  ));
  if (target.getTime() < now.getTime() + 5 * 60_000) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const release = await acquireJobLock(admin, "campaign-overflow-rebalance");
  if (!release) {
    return new Response(JSON.stringify({ skipped: "locked" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    // Find clusters: (campaign_id, scheduled_at) groups with > THRESHOLD rows
    // currently in scheduled status.
    const { data: clusters, error } = await admin.rpc("campaign_overflow_clusters", {
      _threshold: CLUSTER_THRESHOLD,
    });
    if (error) {
      // Fallback: skip silently if RPC is missing — the migration may not have
      // landed yet.
      return new Response(JSON.stringify({ ok: true, skipped: "rpc_missing", error: error.message }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let totalReassigned = 0;
    const perCampaign: Record<string, number> = {};

    for (const c of (clusters ?? []) as Array<{ campaign_id: string; scheduled_at: string; n: number }>) {
      const { data: rows } = await admin
        .from("campaign_recipients")
        .select("id")
        .eq("campaign_id", c.campaign_id)
        .eq("scheduled_at", c.scheduled_at)
        .eq("status", "scheduled");

      const ids = (rows ?? []).map((r: any) => r.id);
      if (ids.length < CLUSTER_THRESHOLD) continue;

      const start = nextBusinessWindowStartUtc().getTime();
      const spanMs = WINDOW_HOURS * 3600 * 1000;
      // Shuffle for uniform distribution.
      ids.sort(() => Math.random() - 0.5);

      // Update one-by-one (Supabase rest doesn't support per-row UPDATE in batch
      // without RPC). Cluster sizes are typically a few hundred so this is fine.
      for (let i = 0; i < ids.length; i++) {
        const t = start + (i / Math.max(1, ids.length - 1)) * spanMs
                + (Math.random() * 2 - 1) * JITTER_SEC * 1000;
        await admin
          .from("campaign_recipients")
          .update({ scheduled_at: new Date(t).toISOString(), updated_at: new Date().toISOString() })
          .eq("id", ids[i]);
      }

      // Refresh campaign first_scheduled_at so the dashboard reflects truth.
      const { data: minRow } = await admin
        .from("campaign_recipients")
        .select("scheduled_at")
        .eq("campaign_id", c.campaign_id)
        .in("status", ["scheduled", "pending"])
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (minRow?.scheduled_at) {
        await admin
          .from("campaigns")
          .update({ first_scheduled_at: minRow.scheduled_at })
          .eq("id", c.campaign_id);
      }

      totalReassigned += ids.length;
      perCampaign[c.campaign_id] = (perCampaign[c.campaign_id] ?? 0) + ids.length;
    }

    if (totalReassigned > 0) {
      const breakdown = Object.entries(perCampaign)
        .map(([cid, n]) => `${cid.slice(0, 8)}…: ${n}`)
        .join(" · ");
      await sendSlackMessage(
        SLACK_BOOKINGS_CHANNEL,
        `🧯 Overflow rebalance respread *${totalReassigned}* clamped recipient(s) across ${Object.keys(perCampaign).length} campaign(s).\n${breakdown}`,
      );
    }

    return new Response(JSON.stringify({ ok: true, clusters: clusters?.length ?? 0, reassigned: totalReassigned }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } finally {
    await release();
  }
});
