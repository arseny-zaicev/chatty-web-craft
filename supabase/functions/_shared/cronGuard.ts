// One-line wrapper to make cron-driven edge functions overload-safe.
//
// Wraps a handler with:
//  1. Two-path kill switch (env + DB flag) — early-returns {skipped: ...}
//  2. Structured per-run logging via withJobRun (status + duration_ms)
//
// Overlap protection (advisory lock) is NOT added here so we don't double-lock
// functions that already call acquireJobLock manually. For functions that need
// a lock, call acquireJobLock(admin, jobName) at the top of your handler body.
//
// Usage:
//   Deno.serve(cronGuard("lead-dispatch", async (req) => {
//     // ... your existing body, including its own admin client ...
//   }));
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { killReason } from "./jobKillSwitch.ts";
import { withJobRun, logJobSkipped } from "./jobRun.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function cronGuard(
  jobName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS });
    }
    const startedAt = Date.now();

    // Lightweight DB client just for the kill-switch read. The handler creates
    // its own admin client; this one is short-lived and only used here.
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

    return await withJobRun(jobName, async () => handler(req));
  };
}
