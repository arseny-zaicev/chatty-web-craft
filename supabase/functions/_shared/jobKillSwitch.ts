// Two-path kill switch for cron-triggered edge functions.
//
// Path A — env (always works, no DB needed):
//   Secret JOBS_KILLED:
//     ""          -> nothing killed
//     "all" / "*" -> every job killed
//     "a,b,c"     -> only those jobs killed (case-insensitive, by jobName)
//   Read at the top of Deno.serve before any DB call. Propagates on next
//   cold start of the function (~30s).
//
// Path B — DB flag (sub-minute control):
//   public.system_flags row key='jobs.disabled', value jsonb shaped:
//     { "all": boolean, "jobs": string[] }
//   Single supabase-js read, AbortSignal.timeout(1500). Any error/timeout
//   -> fail OPEN (return false), so a degraded DB doesn't itself stop work.
//
// Path C — manual cron.unschedule SQL — see docs/runbook-backend-incident.md.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function envKilled(jobName: string): boolean {
  const v = (Deno.env.get("JOBS_KILLED") ?? "").trim().toLowerCase();
  if (!v) return false;
  if (v === "all" || v === "*") return true;
  return v.split(",").map((s) => s.trim()).includes(jobName.toLowerCase());
}

export async function flagKilled(
  admin: SupabaseClient,
  jobName: string,
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("system_flags")
      .select("value")
      .eq("key", "jobs.disabled")
      .abortSignal(AbortSignal.timeout(1500))
      .maybeSingle();
    const v = data?.value as { all?: boolean; jobs?: string[] } | undefined;
    if (!v) return false;
    if (v.all === true) return true;
    return Array.isArray(v.jobs) && v.jobs.includes(jobName);
  } catch {
    return false; // fail open
  }
}

/**
 * Convenience: returns the kill reason if the job should stop, else null.
 * Checks env first (cheap, no DB), then the DB flag.
 */
export async function killReason(
  admin: SupabaseClient,
  jobName: string,
): Promise<"kill_switch_env" | "kill_switch_flag" | null> {
  if (envKilled(jobName)) return "kill_switch_env";
  if (await flagKilled(admin, jobName)) return "kill_switch_flag";
  return null;
}
