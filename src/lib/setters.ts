// Helpers around the workspace_setters table (people who handle conversations).
import { supabase } from "@/integrations/supabase/client";

export type Setter = {
  id: string;
  workspace_id: string;
  display_name: string;
  avatar_url: string | null;
  external: boolean;
  linked_user_id: string | null;
  is_active: boolean;
};

export const setterKeys = {
  list: (workspaceId?: string) => ["setters", workspaceId ?? "all"] as const,
  perf: (workspaceId?: string, from?: string, to?: string, pipelineId?: string | null, setterId?: string | null) =>
    ["setter-perf", workspaceId ?? "all", from, to, pipelineId ?? "all", setterId ?? "all"] as const,
};

export async function fetchSetters(workspaceId?: string): Promise<Setter[]> {
  if (!workspaceId) return [];
  const { data, error } = await supabase
    .from("workspace_setters")
    .select("id, workspace_id, display_name, avatar_url, external, linked_user_id, is_active")
    .eq("workspace_id", workspaceId)
    .order("is_active", { ascending: false })
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as Setter[];
}

export async function assignSetter(conversationId: string, setterId: string | null) {
  const { error } = await supabase
    .from("conversations")
    .update({ assigned_setter_id: setterId })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function createSetter(args: {
  workspaceId: string;
  displayName: string;
  linkedUserId?: string | null;
  external?: boolean;
  avatarUrl?: string | null;
}) {
  const { data, error } = await supabase
    .from("workspace_setters")
    .insert({
      workspace_id: args.workspaceId,
      display_name: args.displayName,
      linked_user_id: args.linkedUserId ?? null,
      external: args.external ?? !args.linkedUserId,
      avatar_url: args.avatarUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Setter;
}

export async function updateSetter(id: string, patch: Partial<Pick<Setter, "display_name" | "is_active" | "avatar_url">>) {
  const { error } = await supabase.from("workspace_setters").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSetter(id: string) {
  const { error } = await supabase.from("workspace_setters").delete().eq("id", id);
  if (error) throw error;
}

export type SetterPerformanceRow = {
  setter_id: string;
  display_name: string;
  avatar_url: string | null;
  is_external: boolean;
  linked_user_id: string | null;
  active_chats: number;
  avg_first_response_seconds: number | null;
  median_first_response_seconds: number | null;
  avg_reply_seconds: number | null;
  median_reply_seconds: number | null;
  replies_in_window: number;
  conv_booked: number;
  conv_showed: number;
  conv_closed: number;
};

export async function fetchSetterPerformance(args: {
  workspaceId: string;
  from: Date;
  to: Date;
  pipelineId?: string | null;
  setterId?: string | null;
}): Promise<SetterPerformanceRow[]> {
  const { data, error } = await supabase.rpc("setter_performance" as never, {
    _workspace_id: args.workspaceId,
    _from: args.from.toISOString(),
    _to: args.to.toISOString(),
    _pipeline_id: args.pipelineId ?? null,
    _setter_id: args.setterId ?? null,
  } as never);
  if (error) throw error;
  return ((data ?? []) as unknown) as SetterPerformanceRow[];
}
