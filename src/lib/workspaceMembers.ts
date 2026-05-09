import { supabase } from "@/integrations/supabase/client";

export type WorkspaceMember = {
  user_id: string;
  role: string;
  full_name: string | null;
};

export const workspaceMembersKey = (workspaceId?: string) =>
  ["workspace", workspaceId ?? "none", "members-with-names"] as const;

/** Fetch members of a workspace with their full names from profiles.
 *  Includes the workspace owner even if not in workspace_members. */
export async function fetchWorkspaceMembers(workspaceId?: string): Promise<WorkspaceMember[]> {
  if (!workspaceId) return [];

  const [membersRes, wsRes] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspaces")
      .select("owner_user_id")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  if (membersRes.error) throw membersRes.error;

  const userIds = new Set<string>();
  (membersRes.data ?? []).forEach((m) => userIds.add(m.user_id));
  if (wsRes.data?.owner_user_id) userIds.add(wsRes.data.owner_user_id);

  if (userIds.size === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", Array.from(userIds));

  const nameMap = new Map<string, string | null>();
  (profiles ?? []).forEach((p) => nameMap.set(p.user_id, p.full_name));

  const result: WorkspaceMember[] = [];
  if (wsRes.data?.owner_user_id) {
    result.push({
      user_id: wsRes.data.owner_user_id,
      role: "owner",
      full_name: nameMap.get(wsRes.data.owner_user_id) ?? null,
    });
  }
  (membersRes.data ?? []).forEach((m) => {
    if (m.user_id === wsRes.data?.owner_user_id) return;
    result.push({
      user_id: m.user_id,
      role: m.role,
      full_name: nameMap.get(m.user_id) ?? null,
    });
  });
  return result;
}

export const memberDisplayName = (m: Pick<WorkspaceMember, "full_name" | "user_id"> | null | undefined) => {
  if (!m) return "Unassigned";
  return m.full_name?.trim() || `User ${m.user_id.slice(0, 6)}`;
};

export const memberInitials = (m: Pick<WorkspaceMember, "full_name" | "user_id"> | null | undefined) => {
  if (!m) return "?";
  const name = m.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return m.user_id.slice(0, 2).toUpperCase();
};
