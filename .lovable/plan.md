
# Backend stabilization plan v4 (final, repo-scope explicit)

## 1. Live inventory (source of truth)

### Group 1 — Active cron in Cloud AND function in repo (patched this pass)

| jobname (Cloud) | schedule | repo function |
|---|---|---|
| `auto-generate-insights-15min` | `*/15 * * * *` | `auto-generate-insights` |
| `classify-replies-15min` | `*/15 * * * *` | `classify-replies` |
| `campaign-day-rollover-15m` | `*/15 * * * *` | `campaign-day-rollover` |
| `campaign-overflow-rebalance-30m` | `*/30 * * * *` | `campaign-overflow-rebalance` |
| `numbers-health-sync-every-15-min` | `*/15 * * * *` | `numbers-health-sync` |
| `numbers-health-digest-every-6h` | `0 */6 * * *` | `numbers-health-digest` |
| `gupshup-mail-poll-every-5min` | `*/5 * * * *` | `gupshup-mail-poll` |
| `templates-status-sync-hourly` | `0 5-17 * * *` | `templates-status-sync` |
| `reply-notification-watchdog-hourly` | `15 * * * *` | `reply-notification-watchdog` |
| `slack-inbox-watch-every-30min` | `*/30 * * * *` | `slack-inbox-watch` |
| `slack-morning-digest` | `0 5 * * *` | `slack-morning-digest` |
| `slack-evening-digest` | `0 16 * * *` | `slack-evening-digest` |
| `slack-pipeline-digest-evening` | `0 16 * * *` | `slack-pipeline-digest` |

### Group 2 — Dormant in Cloud (no active cron) but function present in repo (patched this pass — safe before any future re-enable)

`process-email-queue`, `campaigns`, `lead-dispatch`, `follow-up-dispatch`, `dispatch-pipeline-webhooks`, `slack-dispatch`, `google-sheets-sync`, `health-watchdog`, `automation-time-watchdog`.

### Group 3 — Cloud-only, NOT patched this pass (runbook only)

Verified against `supabase/functions/` tree: **none**. Every function referenced in current/historical cron is present in the repo. If a Cloud-only job is discovered later, it goes here and gets a runbook entry only — no code change in this pass.

### Group 4 — Webhook/RPC only (out of scope)

Skipped (not cron-driven, no overload risk): `whatsapp-webhook`, `whatsapp-webhook-replay`, `send-whatsapp`, `lead-intake`, `calendly-webhook`, `submit-form`, `auth-email-hook`, `init-admin`, `admin-clients`, `invite-workspace-member`, `workspace-invite-link`, `audience-ai-prepare`, `import-audience-from-personal`, `ops-assistant`, `pipeline-pause`, `tv-token`, `register-calendly-webhook`, `gupshup-set-callback`, `reconcile-messages`, `campaign-insights`, `campaign-report-export`, `campaign-report-pdf`, `manager-payout-report-pdf`, `payout-report-pdf`, `slack-payout-post`, `test-pipeline-webhook`, `generate-ai-seo-report`, `google-sheets`, `cron-heartbeat`.

**Implementation scope = Group 1 ∪ Group 2 = 22 functions, all present in repo.**

## 2. Three emergency stop paths

### Path A — Env kill switch (always works, no DB needed)
Secret `JOBS_KILLED`. Empty = no-op. `"all"`/`"*"` = stop everything. Comma list = stop only those. Checked at the top of `Deno.serve` before any DB call.

```ts
// _shared/jobKillSwitch.ts
export function envKilled(jobName: string): boolean {
  const v = (Deno.env.get("JOBS_KILLED") ?? "").trim().toLowerCase();
  if (!v) return false;
  if (v === "all" || v === "*") return true;
  return v.split(",").map(s => s.trim()).includes(jobName.toLowerCase());
}
```
Flip via Backend → Secrets. Takes effect on next cold start (~30s).

### Path B — DB flag (simple, fail-open)
Reuse `public.system_flags`, single row `key='jobs.disabled'`, value `{"all": false, "jobs": []}`. One supabase-js read with `AbortSignal.timeout(1500)`. Any error/timeout → return `false` (continue normally).

```ts
export async function flagKilled(admin, jobName): Promise<boolean> {
  try {
    const { data } = await admin
      .from("system_flags").select("value").eq("key", "jobs.disabled")
      .abortSignal(AbortSignal.timeout(1500)).maybeSingle();
    const v = data?.value as { all?: boolean; jobs?: string[] } | undefined;
    if (!v) return false;
    if (v.all === true) return true;
    return Array.isArray(v.jobs) && v.jobs.includes(jobName);
  } catch { return false; }
}
```
No RPC, no statement_timeout, no extra plumbing.

### Path C — Manual SQL unschedule (nuclear, in runbook)
Paste-ready block targeting the 13 currently-active `jobname`s from Group 1, plus a template `WHERE jobname IN (...)` for anything re-scheduled later.

Incident order: A → B → C.

## 3. Overlap protection

`acquireJobLock(admin, jobName)` (existing helper, fail-open) added to functions in **Group 1 ∪ Group 2** that don't already have it:

- Already locked (keep as-is): `campaigns`, `lead-dispatch`, `slack-dispatch`, `follow-up-dispatch`.
- Add lock to: `dispatch-pipeline-webhooks`, `process-email-queue`, `google-sheets-sync`, `health-watchdog`, `automation-time-watchdog`, `classify-replies`, `auto-generate-insights`, `numbers-health-sync`, `gupshup-mail-poll`.

## 4. Operational per-run logging

New `_shared/jobRun.ts` exposes `withJobRun(name, fn)`. Body receives a mutable `run` object: `selected`, `processed`, `skipped(reason, n?)`. Always emits one structured line in `finally`:

```
[job:NAME] status=ok selected=42 processed=40 skipped=2 skip_reasons={locked_row:1,no_number:1} duration_ms=1834
[job:NAME] status=skipped reason=kill_switch_env duration_ms=2
[job:NAME] status=skipped reason=kill_switch_flag duration_ms=8
[job:NAME] status=skipped reason=locked duration_ms=14
[job:NAME] status=failed err="..." duration_ms=5012 selected=42 processed=11
```

Applied to all 22 functions in scope.

## 5. Runbook

`docs/runbook-backend-incident.md`:
- Paths A/B/C with paste-ready commands
- Full Group 1 jobname → repo function map (for Path C)
- Group 2 list as "currently dormant — do not re-enable casually"
- Group 3 placeholder ("Cloud-only jobs go here if discovered")
- Grep commands for the new `[job:NAME]` log format
- Pointer to the future re-enable plan (out of scope)

## 6. Out of scope (explicit)

- No `cron.schedule` calls. Zero re-enable.
- No edits to Group 3 (empty today) or Group 4 functions.
- No frontend, no product logic, no schema changes beyond seeding the kill-switch row.

## 7. Implementation order

1. Migration: idempotent seed of `system_flags ('jobs.disabled', '{"all":false,"jobs":[]}')`.
2. Add `_shared/jobKillSwitch.ts` + `_shared/jobRun.ts` (pure additions).
3. Wire kill-switch + `withJobRun` into Group 1 functions (live in prod — protect first).
4. Wire kill-switch + `withJobRun` + missing locks into Group 2 functions (safe-before-reenable).
5. Write `docs/runbook-backend-incident.md`.
6. Stop.

## Technical notes

- Lock helper fails open if `try_job_lock` RPC missing → safe to add the call before RPC exists.
- All edits additive; healthy runs gain one cheap flag read + one log line.
- Zero RLS or schema changes beyond the one seed row.
