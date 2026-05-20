// Pure helpers + presentational component extracted from LaunchWizard.tsx
// (structural hardening stage 1). No runtime behavior change: each helper
// mirrors the inline useMemo logic exactly so launch-gate semantics are
// preserved bit-for-bit.

import { AlertTriangle } from "lucide-react";
import { NAME_FALLBACK_PHRASES } from "@/lib/prepPresets";

export interface StaticQaIssue { key: string; reason: string }

export interface SampleRow {
  phone: string;
  payload: Record<string, any>;
  derived_payload: Record<string, any>;
}

// Two severity levels (Plan §D/§7):
//   warnings → show but DO NOT block launch
//   blockers → block launch ONLY when every sampled row mismatches an expected
//              static value (true preset bug, not normal drift).
export function computeStaticQaWarnings(
  audienceSource: string,
  expectedStaticValues: Record<string, string>,
  rows: SampleRow[],
): StaticQaIssue[] {
  if (audienceSource !== "database") return [];
  if (rows.length === 0) return [];
  const banned = new Set(NAME_FALLBACK_PHRASES.map((s) => s.toLowerCase()));
  const out: StaticQaIssue[] = [];
  for (const [key, expected] of Object.entries(expectedStaticValues)) {
    const got = rows.map((r) => String(r.derived_payload?.[key] ?? ""));
    const bad = got.find((g) => g.trim() !== expected.trim());
    if (bad !== undefined) {
      out.push({
        key,
        reason: `Expected campaign-static "${expected.slice(0, 60)}${expected.length > 60 ? "..." : ""}", found "${bad.slice(0, 60)}${bad.length > 60 ? "..." : ""}" in some sampled rows.`,
      });
    }
  }
  if (Object.keys(expectedStaticValues).length === 0 && rows.length > 0) {
    for (const k of Object.keys(rows[0].derived_payload ?? {})) {
      if (k === "var_1") continue;
      const vals = rows.map((r) => String(r.derived_payload?.[k] ?? "").trim().toLowerCase());
      if (vals.every((v) => banned.has(v))) {
        out.push({
          key: k,
          reason: `Every sampled row has name-fallback text in ${k}. Likely a prep mistake — re-prepare with copy from Materials.`,
        });
      }
    }
  }
  return out;
}

export function computeStaticQaBlockers(
  audienceSource: string,
  expectedStaticValues: Record<string, string>,
  rows: SampleRow[],
): StaticQaIssue[] {
  if (audienceSource !== "database") return [];
  if (rows.length === 0) return [];
  const out: StaticQaIssue[] = [];
  for (const [key, expected] of Object.entries(expectedStaticValues)) {
    const allBad = rows.every((r) => String(r.derived_payload?.[key] ?? "").trim() !== expected.trim());
    if (allBad) out.push({ key, reason: `Every sampled row mismatches expected static value for ${key}. Re-prepare the batch.` });
  }
  return out;
}

interface StaticQaPanelProps {
  issues: StaticQaIssue[];
  blockers: StaticQaIssue[];
}

// Direct extraction of the inline JSX block (lines 1902-1915 in pre-refactor
// LaunchWizard.tsx). Classnames, copy, and icon match the original verbatim.
export function StaticQaPanel({ issues, blockers }: StaticQaPanelProps) {
  if (issues.length === 0) return null;
  const blocking = blockers.length > 0;
  return (
    <div className={`text-xs flex items-start gap-1.5 ${blocking ? "text-rose-600" : "text-amber-600"}`}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div>
        <b>{blocking ? "Audience data quality (blocking):" : "Audience data quality (warning):"}</b>
        <ul className="list-disc pl-4 mt-0.5">
          {issues.map((i) => <li key={i.key}><span className="font-mono">{i.key}</span>: {i.reason}</li>)}
        </ul>
        {!blocking && (
          <p className="mt-1 opacity-80">Launch is allowed — only some sampled rows drifted. Re-prepare if you want strict consistency.</p>
        )}
      </div>
    </div>
  );
}
