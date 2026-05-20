#!/usr/bin/env node
/**
 * Grep-guard: forbid UI components from reading lagging campaign counters
 * (campaigns.sent_count / failed_count / delivered_count) or the legacy
 * v_metrics_today_by_campaign view via direct .select() / .from() strings.
 *
 * Allowed (canonical layer / generated types):
 *   src/lib/metrics.ts
 *   src/lib/portfolioMetrics.ts
 *   src/lib/campaigns.ts
 *   src/lib/launchData.ts
 *   src/lib/crmData.ts
 *   src/lib/opsPerformance.ts
 *   src/integrations/supabase/types.ts
 *
 * Anywhere else: build fails. Forces new screens to go through metrics.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWLIST = new Set([
  "src/lib/metrics.ts",
  "src/lib/portfolioMetrics.ts",
  "src/lib/campaigns.ts",
  "src/lib/launchData.ts",
  "src/lib/crmData.ts",
  "src/lib/opsPerformance.ts",
  "src/integrations/supabase/types.ts",
]);

// Match a .select("...sent_count..."), .select(`...failed_count...`), .from("v_metrics_today_by_campaign"), etc.
const SELECT_PATTERN = /\.(select|from)\s*\(\s*[`'"][^`'"]*\b(sent_count|failed_count|delivered_count|v_metrics_today_by_campaign)\b[^`'"]*[`'"]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOWLIST.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (SELECT_PATTERN.test(line)) {
      violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 200)}`);
    }
  });
}

if (violations.length > 0) {
  console.error("\n❌ canonical-stats-truth: UI files must not read lagging campaign counters directly.");
  console.error("   Route reads through src/lib/metrics.ts (campaign_metrics_for_range / partner_metrics_for_range).\n");
  for (const v of violations) console.error("   " + v);
  console.error(`\n   ${violations.length} violation(s).\n`);
  process.exit(1);
}

console.log("✅ canonical-stats-truth: no lagging-counter reads in UI files.");
