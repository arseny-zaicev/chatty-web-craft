// One-line wrapper to make cron-driven edge functions overload-safe.
//
// Wraps a handler with:
//  1. Two-path kill switch (env + DB flag) — early-returns {skipped: ...}
//  2. Optional advisory lock (set `lock: true`) for jobs that don't already
//     call acquireJobLock manually
//  3. Structured per-run logging via withJobRun (status + duration_ms)
//
// Usage:
//   Deno.serve(cronGuard("lead-dispatch", async (req) => { ... }));
//   Deno.serve(cronGuard({ jobName: "health-watchdog", lock: true },
//     async (req) => { ... }));
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { killReason } from "./jobKillSwitch.ts";
import { acquireJobLock } from "./jobLock.ts";
import { withJobRun, logJobSkipped } from "./jobRun.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export type CronGuardOpts = {
  jobName: string;
  /** Acquire advisory lock; default false (handlers that lock manually leave this off). */
  lock?: boolean;
};

export function cronGuard(
  opts: string | CronGuardOpts,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  const { jobName, lock = false } = typeof opts === "string"
    ? { jobName: opts, lock: false }
    : opts;

  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS });
    }
    const startedAt = Date.now();

    // Lightweight admin client for kill-switch read + optional lock.
    // The handler creates its own admin client; this one is short-lived.
    const checker = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const kr = await killReason(checker, jobName);
    if (kr) {
      logJobSkipped(jobName, kr, startedAt);
      return new Response(JSON.stringify({ skipped: kr }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let release: (() => Promise<void>) | null = null;
    if (lock) {
      release = await acquireJobLock(checker, jobName);
      if (!release) {
        logJobSkipped(jobName, "locked", startedAt);
        return new Response(JSON.stringify({ skipped: "locked" }), {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }

    try {
      return await withJobRun(jobName, async () => handler(req));
    } finally {
      if (release) await release();
    }
  };
}
