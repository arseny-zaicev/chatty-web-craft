import { supabase } from "@/integrations/supabase/client";

export type WorkspaceMember = {
  user_id: string;
  role: string;
  full_name: string | null;
  email?: string | null;
};

export const workspaceMembersKey = (workspaceId?: string) =>
  ["workspace", workspaceId ?? "none", "members-with-names"] as const;

/** Fetch members of a workspace with display info (full_name + email fallback).
 *  Uses a SECURITY DEFINER RPC so we can read auth.users.email without exposing the table. */
export async function fetchWorkspaceMembers(workspaceId?: string): Promise<WorkspaceMember[]> {
  if (!workspaceId) return [];

  const { data, error } = await supabase.rpc("get_workspace_member_display", {
    _workspace_id: workspaceId,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ user_id: string; role: string; full_name: string | null; email: string | null }>;
  // Owner first, then everyone else
  rows.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
  return rows.map((r) => ({
    user_id: r.user_id,
    role: r.role,
    full_name: r.full_name,
    email: r.email,
  }));
}

const emailLocalPart = (email?: string | null) => {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
};

export const memberDisplayName = (m: Pick<WorkspaceMember, "full_name" | "user_id" | "email"> | null | undefined) => {
  if (!m) return "Unassigned";
  return m.full_name?.trim() || emailLocalPart(m.email) || `User ${m.user_id.slice(0, 6)}`;
};

export const memberInitials = (m: Pick<WorkspaceMember, "full_name" | "user_id" | "email"> | null | undefined) => {
  if (!m) return "?";
  const name = m.full_name?.trim() || emailLocalPart(m.email);
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return m.user_id.slice(0, 2).toUpperCase();
};
