import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRole = "admin" | "manager" | "client" | "none";

/**
 * Resolves the current user's role within a workspace.
 *  - "admin": global admin (arseny@iskra.ae)
 *  - "manager": workspace owner OR workspace_members.role = 'manager'
 *  - "client": workspace_members.role = 'client'
 *  - "none": no access
 */
export function useWorkspaceRole(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-role", workspaceId],
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WorkspaceRole> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return "none";
      if (user.email?.toLowerCase() === "arseny@iskra.ae") return "admin";

      const { data: ws } = await supabase
        .from("workspaces")
        .select("owner_user_id")
        .eq("id", workspaceId!)
        .maybeSingle();
      if (ws?.owner_user_id === user.id) return "manager";

      const { data: mem } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId!)
        .eq("user_id", user.id)
        .maybeSingle();
      if (mem?.role === "manager") return "manager";
      if (mem?.role === "client") return "client";
      return "none";
    },
  });
}

/** True if role can see Library, Settings, Launch, templates, app names, etc. */
export const isManagerLike = (r: WorkspaceRole | undefined) => r === "admin" || r === "manager";
