// Pure helpers extracted from LaunchWizard.tsx (structural hardening stage 1).
// No behavior change: mirrors the original inline `snapshotFingerprint` /
// `snapshotKey` derivation exactly so sessionStorage keys stay compatible.

export interface SnapshotFingerprintInput {
  dbBatchId: string | null | undefined;
  recipientsCount: number;
  templateKey: string | null | undefined;
  numberIds: string[];
  mapping: Record<string, string>;
}

export function computeSnapshotFingerprint(input: SnapshotFingerprintInput): string {
  const parts = {
    a: input.dbBatchId || `paste:${input.recipientsCount}`,
    t: input.templateKey ?? "",
    n: [...input.numberIds].sort(),
    m: Object.entries(input.mapping).sort(([a], [b]) => a.localeCompare(b)),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(parts)))).slice(0, 16);
}

export function snapshotStorageKey(workspaceId: string | undefined, dbBatchId: string | null | undefined): string {
  return `launch-snapshot:${workspaceId ?? ""}:${dbBatchId || "paste"}`;
}
