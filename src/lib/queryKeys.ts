// Centralized react-query key namespaces.
//
// Goal: a single import surface so `invalidateQueries` and `useQuery` callsites
// can't drift apart with mistyped strings. New code MUST import from here.
// Existing pages may continue to use their local key helpers, but should be
// migrated incrementally.
//
// Pattern: each domain exposes a frozen object of key builders. Always include
// the scoping id (workspaceId / campaignId / etc.) so cache buckets are isolated.

// ----- Campaigns / launches / templates -----
export const campaignKeys = {
  all: ["campaigns"] as const,
  summaries: (workspaceId?: string) =>
    ["campaigns", "summaries", workspaceId ?? ""] as const,
  meta: (workspaceId: string, numberIds: string[], templateIds: string[]) =>
    ["campaigns", "meta", workspaceId, numberIds.join(","), templateIds.join(",")] as const,
  liveCounts: (workspaceId: string, campaignIds: string[]) =>
    [
      "campaigns",
      "live-counts",
      workspaceId,
      campaignIds.slice().sort().join(","),
    ] as const,
  runtime: (campaignId: string) =>
    ["campaign-runtime", campaignId] as const,
  insight: (campaignId: string) =>
    ["campaign-insight", campaignId] as const,
  insightLiveCounts: (campaignIds: string[]) =>
    ["campaign-live-counts", campaignIds.slice().sort().join(",")] as const,
  recipientsLite: (groupKey: string, campaignIds: string[]) =>
    ["campaign-recipients-lite", groupKey, campaignIds.join(",")] as const,
  recipientsFull: (groupKey: string, campaignIds: string[]) =>
    ["campaign-recipients-full", groupKey, campaignIds.join(",")] as const,
};

// ----- Admin / finance / partners -----
export const adminKeys = {
  partners: () => ["admin", "partners"] as const,
  partnersAgg: () => ["admin", "partners", "agg"] as const,
  partnersMetrics: (partnerIds: string[]) =>
    ["admin", "partners", "metrics", partnerIds] as const,
  numberAttribution: () => ["admin", "partners", "number-attribution"] as const,
  partner: (id: string) => ["admin", "partner", id] as const,
  partnerAssigns: (id: string) => ["admin", "partner-assigns", id] as const,
  partnerBms: (id: string, bmIds: string[]) =>
    ["admin", "partner-bms", id, bmIds] as const,
  partnerNumbers: (id: string, bmIds: string[]) =>
    ["admin", "partner-numbers", id, bmIds] as const,
  partnerNumLive: (numberIds: string[]) =>
    ["admin", "partner-num-live", numberIds] as const,
  partnerRuns: (id: string) => ["admin", "partner-runs", id] as const,
  partnerMetrics: (id: string) => ["admin", "partner", id, "metrics"] as const,
  allWorkspacesMini: () => ["admin", "all-workspaces-mini"] as const,
};

export const financeKeys = {
  all: ["finance"] as const,
  run: (id: string) => ["finance", "run", id] as const,
  runItems: (id: string) => ["finance", "run-items", id] as const,
  runAudit: (id: string) => ["finance", "run-audit", id] as const,
};

export const reconciliationKeys = {
  summary: (from: string, to: string) => ["recon-summary", from, to] as const,
  daily: (from: string, to: string) => ["recon-daily", from, to] as const,
  orphans: (from: string, to: string) => ["recon-orphans", from, to] as const,
};

// ----- Workspace access -----
export const workspaceAccessKeys = {
  access: (workspaceId?: string) => ["workspace-access", workspaceId] as const,
  roleBucket: (workspaceId?: string) =>
    ["workspace-role-bucket", workspaceId] as const,
};

// ----- Fleet (admin) -----
export const fleetKeys = {
  analytics: (period: string) => ["fleet-analytics", period] as const,
};

// Re-exports of existing namespaces so consumers can pull everything from here.
export { crmKeys } from "./crmData";
export { pipelinesKey } from "./pipelines";
export { workspaceMembersKey } from "./workspaceMembers";
