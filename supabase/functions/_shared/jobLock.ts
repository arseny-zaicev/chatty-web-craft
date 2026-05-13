// Postgres advisory lock for cron-triggered edge functions.
//
// Cron + edge functions can fire overlapping invocations (manual trigger
// while cron is mid-run, slow run that runs into the next tick, two cron
// schedulers in failover). For jobs that mutate shared state (advancing
// campaign day, draining slack_event_queue, etc.) overlap = duplicate
// sends / double-charges.
//
// Usage:
//   const release = await acquireJobLock(admin, "slack-dispatch");
//   if (!release) return new Response(JSON.stringify({ skipped: "locked" }), { status: 200 });
//   try { ... } finally { await release(); }
//
// We use session-scoped pg_try_advisory_lock + pg_advisory_unlock instead of
// xact-scoped because the supabase-js client does not pin a single connection
// per call; a transaction-bound lock is unsafe across multiple `.from()` calls.
//
// The lock key is hashtext(jobName) cast to bigint so different job names
// never collide and we don't need to track an int registry.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type JobLockRelease = () => Promise<void>;

export async function acquireJobLock(
  admin: SupabaseClient,
  jobName: string,
): Promise<JobLockRelease | null> {
  try {
    const { data, error } = await admin.rpc("try_job_lock", { _job_name: jobName });
    if (error) {
      console.warn(`[jobLock] try_job_lock(${jobName}) error`, error.message);
      // Fail open: if the helper RPC is missing, don't block the job.
      return async () => {};
    }
    if (data === true) {
      return async () => {
        try {
          await admin.rpc("release_job_lock", { _job_name: jobName });
        } catch (e) {
          console.warn(`[jobLock] release_job_lock(${jobName}) error`, (e as Error).message);
        }
      };
    }
    return null;
  } catch (e) {
    console.warn(`[jobLock] unexpected error for ${jobName}`, (e as Error).message);
    return async () => {};
  }
}

/** Convenience wrapper: skips the body cleanly if the job is already running. */
export async function withJobLock<T>(
  admin: SupabaseClient,
  jobName: string,
  body: () => Promise<T>,
): Promise<T | { skipped: "locked" }> {
  const release = await acquireJobLock(admin, jobName);
  if (!release) return { skipped: "locked" };
  try {
    return await body();
  } finally {
    await release();
  }
}
