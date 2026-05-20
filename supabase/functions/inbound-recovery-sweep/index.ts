// inbound-recovery-sweep
//
// Minimum-safe recovery for two reply-loss paths identified in the P0.5 audit:
//
//   1. whatsapp_webhook_raw rows stuck at processing_status='received'
//      (raw payload captured, but the in-process handler never marked the
//      row terminal — usually a runtime kill / deploy mid-request).
//
//   2. whatsapp_webhook_failures rows with replay_status='pending'
//      (whatsapp-webhook captured the payload into the failures table
//      because no whatsapp_numbers row matched; admin replay is manual).
//
// For both, the recovery action is the same and idempotent: re-POST the
// stored payload to /whatsapp-webhook. The webhook dedupes on
// provider_message_id, so re-posting cannot create duplicate inbound
// messages or double-bump unread_count.
//
// Scope is intentionally narrow — NO changes to the webhook handler,
// dispatcher, cron cadence, claim function, or send settings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cronGuard } from "../_shared/cronGuard.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

// Per-run caps — keep tick cheap.
const RAW_BATCH = 100;
const FAIL_BATCH = 100;
// How long a 'received' row must sit before we consider it stuck.
const RAW_STUCK_AFTER_MS = 2 * 60 * 1000;
// Wait before first auto-replay so we don't race a slow handler.
const FAIL_STUCK_AFTER_MS = 5 * 60 * 1000;
// Min spacing between retries of the same failure row.
const FAIL_RETRY_COOLDOWN_MS = 60 * 60 * 1000;
// Stop retrying after N attempts so a permanently mis-routed number can't loop.
const FAIL_MAX_ATTEMPTS = 6;

async function replayPayload(payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    // The webhook returns 200 with {ok:true} on success and 200 with
    // {ok:false,error} on its own failures. Inspect the body so we don't
    // count a soft-fail as recovered.
    const body = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (body && body.ok === false) return { ok: false, error: body.error ?? "webhook soft-fail" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(cronGuard({ jobName: "inbound-recovery-sweep", lock: true }, async (_req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- 1. Drain stuck raw rows ---------------------------------------------
  const rawCutoff = new Date(Date.now() - RAW_STUCK_AFTER_MS).toISOString();
  const { data: stuckRaw, error: rawSelErr } = await admin
    .from("whatsapp_webhook_raw")
    .select("id, payload, retry_count")
    .eq("processing_status", "received")
    .lt("received_at", rawCutoff)
    .order("received_at", { ascending: true })
    .limit(RAW_BATCH);

  let rawRecovered = 0;
  let rawFailed = 0;
  if (rawSelErr) {
    console.error("raw select failed", rawSelErr);
  } else {
    for (const row of stuckRaw ?? []) {
      const r = await replayPayload(row.payload);
      const patch: Record<string, unknown> = {
        retry_count: (row.retry_count ?? 0) + 1,
        last_retried_at: new Date().toISOString(),
      };
      if (r.ok) {
        patch.processing_status = "processed";
        patch.processed_at = new Date().toISOString();
        patch.error_message = `recovered_by_sweep (was: stuck received)`;
        rawRecovered++;
      } else {
        // Leave processing_status='received' so the next sweep retries it.
        patch.error_message = `sweep_retry_failed: ${r.error}`;
        rawFailed++;
      }
      await admin.from("whatsapp_webhook_raw").update(patch).eq("id", row.id);
    }
  }

  // ---- 2. Auto-replay pending failures -------------------------------------
  const failCutoff = new Date(Date.now() - FAIL_STUCK_AFTER_MS).toISOString();
  const retryFloor = new Date(Date.now() - FAIL_RETRY_COOLDOWN_MS).toISOString();

  // The retries column may not exist on older deployments; we read what's
  // available and fall back gracefully.
  const { data: pendingFails, error: failSelErr } = await admin
    .from("whatsapp_webhook_failures")
    .select("id, payload, replay_error, replayed_at, created_at")
    .eq("replay_status", "pending")
    .lt("created_at", failCutoff)
    .or(`replayed_at.is.null,replayed_at.lt.${retryFloor}`)
    .order("created_at", { ascending: true })
    .limit(FAIL_BATCH);

  let failReplayed = 0;
  let failStillFailing = 0;
  let failGivenUp = 0;
  if (failSelErr) {
    console.error("failures select failed", failSelErr);
  } else {
    for (const row of pendingFails ?? []) {
      // Cheap attempt counter via parsing replay_error suffix written by sweep.
      const attemptMatch = /\[attempt:(\d+)]/.exec(row.replay_error ?? "");
      const attempt = attemptMatch ? Number(attemptMatch[1]) : 0;
      if (attempt >= FAIL_MAX_ATTEMPTS) {
        await admin
          .from("whatsapp_webhook_failures")
          .update({
            replay_status: "given_up",
            replay_error: `sweep_given_up after ${attempt} attempts ${row.replay_error ?? ""}`.trim(),
            replayed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failGivenUp++;
        continue;
      }
      const r = await replayPayload(row.payload);
      if (r.ok) {
        await admin
          .from("whatsapp_webhook_failures")
          .update({
            replay_status: "replayed",
            replay_error: null,
            replayed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failReplayed++;
      } else {
        await admin
          .from("whatsapp_webhook_failures")
          .update({
            replay_error: `[attempt:${attempt + 1}] ${r.error}`,
            replayed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        failStillFailing++;
      }
    }
  }

  const summary = {
    ok: true,
    raw: {
      scanned: stuckRaw?.length ?? 0,
      recovered: rawRecovered,
      still_stuck: rawFailed,
    },
    failures: {
      scanned: pendingFails?.length ?? 0,
      replayed: failReplayed,
      still_failing: failStillFailing,
      given_up: failGivenUp,
    },
  };
  console.log("[job:inbound-recovery-sweep]", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}));
