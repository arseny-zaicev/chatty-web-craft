// Structured per-run logging for cron-triggered edge functions.
//
// Always emits exactly one line in `finally`, even on throw:
//   [job:NAME] status=ok selected=42 processed=40 skipped=2 \
//     skip_reasons={locked_row:1,no_number:1} duration_ms=1834
//   [job:NAME] status=skipped reason=kill_switch_env duration_ms=2
//   [job:NAME] status=skipped reason=locked duration_ms=14
//   [job:NAME] status=failed err="..." duration_ms=5012 selected=42 processed=11
//
// Usage:
//   return await withJobRun("lead-dispatch", async (run) => {
//     const rows = await fetchRows();
//     run.selected(rows.length);
//     for (const r of rows) {
//       if (skip(r)) { run.skipped("no_number"); continue; }
//       await process(r);
//       run.processed += 1;
//     }
//     return new Response(JSON.stringify({ ok: true }), { status: 200 });
//   });

export type JobRun = {
  /** Mark how many rows/items were selected to be processed. */
  selected: (n: number) => void;
  /** Mutable counter — increment after each successful unit. */
  processed: number;
  /** Increment a named skip reason. */
  skipped: (reason: string, n?: number) => void;
};

type LogStatus = "ok" | "skipped" | "failed";

function formatLine(
  jobName: string,
  status: LogStatus,
  fields: Record<string, unknown>,
): string {
  const parts: string[] = [`[job:${jobName}]`, `status=${status}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      const inner = Object.entries(v as Record<string, unknown>)
        .map(([kk, vv]) => `${kk}:${vv}`)
        .join(",");
      parts.push(`${k}={${inner}}`);
    } else if (typeof v === "string") {
      // Quote strings that have spaces or =
      const needsQuote = /[\s="]/.test(v);
      parts.push(`${k}=${needsQuote ? JSON.stringify(v) : v}`);
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join(" ");
}

export async function withJobRun<T>(
  jobName: string,
  body: (run: JobRun) => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let selected: number | undefined;
  const skipReasons: Record<string, number> = {};
  let skippedTotal = 0;

  const run: JobRun = {
    selected: (n) => { selected = n; },
    processed: 0,
    skipped: (reason, n = 1) => {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + n;
      skippedTotal += n;
    },
  };

  let status: LogStatus = "ok";
  let err: string | undefined;
  try {
    return await body(run);
  } catch (e) {
    status = "failed";
    err = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    const duration_ms = Date.now() - start;
    const skipReasonsObj = Object.keys(skipReasons).length ? skipReasons : undefined;
    console.log(formatLine(jobName, status, {
      selected,
      processed: run.processed,
      skipped: skippedTotal || undefined,
      skip_reasons: skipReasonsObj,
      duration_ms,
      err,
    }));
  }
}

/** Emit a single skipped-line for early returns (kill switch / lock). */
export function logJobSkipped(
  jobName: string,
  reason: string,
  startedAt: number,
): void {
  console.log(formatLine(jobName, "skipped", {
    reason,
    duration_ms: Date.now() - startedAt,
  }));
}
