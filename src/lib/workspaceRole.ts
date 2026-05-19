import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRoleLabel = string;

export const PERM_KEYS = [
  "perm_overview",
  "perm_inbox",
  "perm_pipeline",
  "perm_campaigns_view",
  "perm_quick_replies_use",
  "perm_quick_replies_manage",
  "perm_settings",
  "perm_data",
  "perm_materials",
  "perm_launch",
  "perm_stats",
  "perm_stats_all",
] as const;
export type PermKey = (typeof PERM_KEYS)[number];

export type WorkspacePermissions = Record<PermKey, boolean>;

export type WorkspaceAccess = {
  /** Free-text role label kept for display only - it does NOT gate access. */
  role: WorkspaceRoleLabel;
  permissions: WorkspacePermissions;
  isAdmin: boolean;
  isOwner: boolean;
  /** Convenience: true if user has perm_settings (or admin/owner). */
  canManageSettings: boolean;
};

const ALL_PERMS_TRUE: WorkspacePermissions = Object.fromEntries(
  PERM_KEYS.map((k) => [k, true]),
) as WorkspacePermissions;

const ALL_PERMS_FALSE: WorkspacePermissions = Object.fromEntries(
  PERM_KEYS.map((k) => [k, false]),
) as WorkspacePermissions;

export function useWorkspaceAccess(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-access", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => resolveAccess(workspaceId!),
  });
}

/** Convenience hook returning a single permission boolean (false while loading). */
export function usePerm(workspaceId: string | undefined, key: PermKey): boolean {
  const { data } = useWorkspaceAccess(workspaceId);
  return Boolean(data?.permissions?.[key]);
}

async function resolveAccess(workspaceId: string): Promise<WorkspaceAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  const empty: WorkspaceAccess = {
    role: "none",
    permissions: { ...ALL_PERMS_FALSE },
    isAdmin: false,
    isOwner: false,
    canManageSettings: false,
  };
  if (!user) return empty;

  const isGlobalAdmin = user.email?.toLowerCase() === "arseny@iskra.ae";

  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const isOwner = ws?.owner_user_id === user.id;

  if (isGlobalAdmin || isOwner) {
    return {
      role: isGlobalAdmin ? "admin" : "owner",
      permissions: { ...ALL_PERMS_TRUE },
      isAdmin: isGlobalAdmin,
      isOwner,
      canManageSettings: true,
    };
  }

  const { data: mem } = await supabase
    .from("workspace_members")
    .select(
      "role, perm_overview, perm_inbox, perm_pipeline, perm_campaigns_view, perm_quick_replies_use, perm_quick_replies_manage, perm_settings, perm_data, perm_materials, perm_launch",
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mem) return empty;

  const permissions: WorkspacePermissions = { ...ALL_PERMS_FALSE };
  for (const k of PERM_KEYS) {
    permissions[k] = Boolean((mem as Record<string, unknown>)[k]);
  }
  return {
    role: (mem.role as string) || "member",
    permissions,
    isAdmin: false,
    isOwner: false,
    canManageSettings: permissions.perm_settings,
  };
}

/* ---------------------------------------------------------------------------
 * Back-compat shims. Older call sites import these; we keep them so the build
 * stays green while we migrate, but they now read from the permission model.
 * Prefer `useWorkspaceAccess` / `usePerm` going forward.
 * ------------------------------------------------------------------------- */

export type WorkspaceRole = "admin" | "manager" | "client" | "none";

/** Coarse role bucket derived from permissions. Display-only - do not gate on this. */
export function useWorkspaceRole(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-role-bucket", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WorkspaceRole> => {
      const a = await resolveAccess(workspaceId!);
      if (a.isAdmin) return "admin";
      if (a.canManageSettings) return "manager";
      if (a.permissions.perm_inbox || a.permissions.perm_pipeline) return "client";
      return "none";
    },
  });
}

export const isManagerLike = (r: WorkspaceRole | undefined) => r === "admin" || r === "manager";
export const isAdmin = (r: WorkspaceRole | undefined) => r === "admin";
