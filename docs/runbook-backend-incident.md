# Backend Incident Runbook

Emergency stop paths for backend cron / dispatch jobs, in order of preference.

> Times in this runbook are Dubai local (GST, UTC+4). Convert DB UTC values with `+4h`.

---

## Path A — Env kill switch (preferred, works even if DB is degraded)

Flip the `JOBS_KILLED` secret via **Backend → Secrets**.

| Value | Effect |
|---|---|
| _(unset / empty)_ | nothing killed (normal) |
| `all` or `*` | every guarded cron job early-returns `{skipped: "kill_switch_env"}` |
| `lead-dispatch,follow-up-dispatch` | only the listed jobs are killed (case-insensitive, comma-separated) |

Propagation: takes effect on next cold start of each function — **typically within 30s**. Costs zero DB roundtrips.

To restore: delete the secret (or set to empty).

---

## Path B — DB flag (sub-minute, no redeploy)

Single row in `public.system_flags`, key `jobs.disabled`. Run in SQL editor:

**Kill everything:**
```sql
UPDATE public.system_flags
SET value = '{"all": true, "jobs": []}'::jsonb, updated_at = now()
WHERE key = 'jobs.disabled';
```

**Kill specific jobs only:**
```sql
UPDATE public.system_flags
SET value = '{"all": false, "jobs": ["lead-dispatch","dispatch-pipeline-webhooks"]}'::jsonb,
    updated_at = now()
WHERE key = 'jobs.disabled';
```

**Restore:**
```sql
UPDATE public.system_flags
SET value = '{"all": false, "jobs": []}'::jsonb, updated_at = now()
WHERE key = 'jobs.disabled';
```

Each guarded function reads this row with a 1.5s timeout. On error/timeout the read **fails open** (job continues), so a dead DB cannot itself stop jobs — that's what Path A is for.

---

## Path C — Manual `cron.unschedule` (nuclear; use when A and B can't stop the bleed)

This stops jobs at the scheduler level — they will not fire again until re-scheduled. Use when a function is hanging the DB before it can even read the kill switch.

**Stop everything currently scheduled (preserves nothing):**
```sql
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = ANY(ARRAY[
  'gupshup-mail-poll-every-5min',
  'numbers-health-sync-every-15-min',
  'classify-replies-15min',
  'auto-generate-insights-15min',
  'campaign-day-rollover-15m',
  'campaign-overflow-rebalance-30m',
  'slack-inbox-watch-every-30min',
  'reply-notification-watchdog-hourly',
  'templates-status-sync-hourly',
  'numbers-health-digest-every-6h',
  'slack-morning-digest',
  'slack-evening-digest',
  'slack-pipeline-digest-evening'
]);
```

Confirm:
```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

---

## Currently scheduled cron jobs (source of truth: `cron.job`)

| jobname | schedule (UTC) | edge function |
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

## Currently dormant — DO NOT re-enable casually

These functions exist in the repo and are kill-switch + lock + logging protected, but are **not** in `cron.job` right now. Re-enabling needs a controlled grouped rollout (see "Re-enable plan" — separate doc, TBD).

`process-email-queue`, `campaigns` (cron `process` action), `lead-dispatch`, `follow-up-dispatch`, `dispatch-pipeline-webhooks`, `slack-dispatch`, `google-sheets-sync`, `health-watchdog`, `automation-time-watchdog`.

## Cloud-only jobs (none today)

No jobs are known to exist only in Cloud without a matching repo function. If one is discovered, add it here and to Path C.

---

## Reading the new structured logs

Every guarded job emits exactly one line per invocation, prefixed `[job:NAME]`.

```
[job:lead-dispatch] status=ok selected=42 processed=40 skipped=2 skip_reasons={no_number:1,locked_row:1} duration_ms=1834
[job:lead-dispatch] status=skipped reason=kill_switch_env duration_ms=2
[job:lead-dispatch] status=skipped reason=kill_switch_flag duration_ms=8
[job:lead-dispatch] status=skipped reason=locked duration_ms=14
[job:lead-dispatch] status=failed err="..." duration_ms=5012 selected=42 processed=11
```

In the edge-functions log search:

- Verify a kill switch took effect: search `[job:` and `kill_switch`
- See which run was slow: search `[job:NAME]` and sort by `duration_ms`
- Spot overlaps: search `reason=locked`
- Spot stuck jobs: filter `status=failed`

---

## Standard recovery sequence

1. **Observe**: `[job:*]` log volume, DB CPU, /auth `/token` latency.
2. **Stop the bleed (Path A)**: set `JOBS_KILLED=all`. Wait ~60s for cold starts.
3. **If DB-driven control still works (Path B)**: set `{"all": true}` for sub-minute coverage in parallel.
4. **If the DB itself is stuck (Path C)**: run the `cron.unschedule` block above.
5. **Confirm auth recovered**: `/auth/v1/health` → 200, `/auth/v1/token` succeeds, admin loads.
6. **Investigate**: search `[job:*]` logs for the offender (largest `duration_ms`, repeated `status=failed`).
7. **Targeted restore**: narrow `JOBS_KILLED` to only the broken job, or use Path B with a single-job list.
8. **Full restore**: clear `JOBS_KILLED`; reset `system_flags` row to `{"all": false, "jobs": []}`.

---

## Out of scope (separate plans)

- **Re-enabling dormant cron** (Group 2 above) — needs grouped rollout with health checks between groups.
- **Per-job cadence redesign** (e.g. moving `process-email-queue` from 5s → 30s) — must be a deliberate launch-time decision, not an incident response.
