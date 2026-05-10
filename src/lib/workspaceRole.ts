import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRole = "admin" | "manager" | "client" | "none";

export type WorkspaceAccess = {
  role: WorkspaceRole;
  /** For client role: whether they can see Overview & Campaigns. Always true for admin/manager. */
  canViewStats: boolean;
};

/**
 * Resolves the current user's role within a workspace.
 *  - "admin": global admin (arseny@iskra.ae) — also creates campaigns from Launch
 *  - "manager": workspace owner OR workspace_members.role = 'manager' (full access, read-only campaigns)
 *  - "client": workspace_members.role = 'client' (inbox + pipeline; overview/campaigns gated by can_view_stats)
 *  - "none": no access
 */
export function useWorkspaceRole(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-role", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WorkspaceRole> => {
      const access = await resolveAccess(workspaceId!);
      return access.role;
    },
  });
}

export function useWorkspaceAccess(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-access", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => resolveAccess(workspaceId!),
  });
}

async function resolveAccess(workspaceId: string): Promise<WorkspaceAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: "none", canViewStats: false };
  if (user.email?.toLowerCase() === "arseny@iskra.ae") return { role: "admin", canViewStats: true };

  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws?.owner_user_id === user.id) return { role: "manager", canViewStats: true };

  const { data: mem } = await supabase
    .from("workspace_members")
    .select("role, can_view_stats")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (mem?.role === "manager") return { role: "manager", canViewStats: true };
  if (mem?.role === "client") return { role: "client", canViewStats: Boolean((mem as { can_view_stats?: boolean }).can_view_stats) };
  return { role: "none", canViewStats: false };
}

/** True if role can see Library, Settings, templates, app names, etc. (Launch is admin-only.) */
export const isManagerLike = (r: WorkspaceRole | undefined) => r === "admin" || r === "manager";
export const isAdmin = (r: WorkspaceRole | undefined) => r === "admin";
