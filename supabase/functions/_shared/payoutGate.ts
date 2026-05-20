// Shared payout-ownership drift gate. Mirrors the SQL check inside
// approve_payout_run so off-UI payout paths (PDF generation, Slack poster,
// manager rollup, future cron) cannot bypass the rule.
//
// Usage:
//   const gate = await assertPayoutOwnershipClean(admin);
//   if (!gate.ok) return json(gate.body, 409);
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type DriftRow = {
  reason: "unassigned_referred" | "legacy_provider_mismatch" | "legacy_referrer_mismatch";
  whatsapp_number_id: string;
  phone_number: string | null;
  display_name: string | null;
  provided_by: string | null;
  assigned_ref: string | null;
};

export type GateResult =
  | { ok: true }
  | {
      ok: false;
      body: {
        error: "payout_ownership_drift";
        message: string;
        counts: { unassigned_referred: number; legacy_provider_mismatch: number; legacy_referrer_mismatch: number };
        offenders: DriftRow[];
      };
    };

export async function assertPayoutOwnershipClean(admin: SupabaseClient): Promise<GateResult> {
  const { data, error } = await admin.rpc("payout_ownership_drift_details" as any);
  if (error) {
    // Fail closed: if we cannot verify, refuse to run payout side effects.
    return {
      ok: false,
      body: {
        error: "payout_ownership_drift",
        message: `drift check failed: ${error.message}`,
        counts: { unassigned_referred: 0, legacy_provider_mismatch: 0, legacy_referrer_mismatch: 0 },
        offenders: [],
      },
    };
  }
  const rows = (data ?? []) as DriftRow[];
  if (rows.length === 0) return { ok: true };
  const counts = {
    unassigned_referred: rows.filter((r) => r.reason === "unassigned_referred").length,
    legacy_provider_mismatch: rows.filter((r) => r.reason === "legacy_provider_mismatch").length,
    legacy_referrer_mismatch: rows.filter((r) => r.reason === "legacy_referrer_mismatch").length,
  };
  return {
    ok: false,
    body: {
      error: "payout_ownership_drift",
      message:
        `payout blocked: ${counts.unassigned_referred} referred without owner, ` +
        `${counts.legacy_provider_mismatch} provider text mismatch, ` +
        `${counts.legacy_referrer_mismatch} referrer text mismatch - fix in Fleet Registry`,
      counts,
      offenders: rows.slice(0, 200), // cap payload
    },
  };
}

/** Format a Slack-friendly summary of offenders (for posting an alert message instead of the report). */
export function formatDriftForSlack(body: Extract<GateResult, { ok: false }>["body"]): string {
  const lines: string[] = [
    `:warning: *Payout run blocked - partner ownership drift*`,
    `• ${body.counts.unassigned_referred} referred numbers without active ownership`,
    `• ${body.counts.legacy_provider_mismatch} provider text mismatch`,
    `• ${body.counts.legacy_referrer_mismatch} referrer text mismatch`,
  ];
  const sample = body.offenders.slice(0, 10);
  if (sample.length) {
    lines.push("", "*First offenders:*");
    for (const r of sample) {
      const label = r.display_name || r.phone_number || r.whatsapp_number_id.slice(0, 8);
      const tag = r.reason === "unassigned_referred"
        ? "no-owner"
        : r.reason === "legacy_provider_mismatch"
        ? `bad provided_by="${r.provided_by ?? ""}"`
        : `bad assigned_ref="${r.assigned_ref ?? ""}"`;
      lines.push(`• \`${label}\` - ${tag}`);
    }
    if (body.offenders.length > sample.length) {
      lines.push(`…and ${body.offenders.length - sample.length} more`);
    }
  }
  lines.push("", "Fix in Fleet Registry, then re-run the payout.");
  return lines.join("\n");
}
