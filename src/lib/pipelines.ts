import { supabase } from "@/integrations/supabase/client";

export type Pipeline = {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const pipelinesKey = (workspaceId?: string) =>
  ["pipelines", workspaceId ?? "all"] as const;

const DEFAULT_STAGES: Array<{ name: string; color: string; stage_type: "open" | "won" | "lost" }> = [
  { name: "Message sent",         color: "#64748b", stage_type: "open" },
  { name: "Other Reply",          color: "#94a3b8", stage_type: "open" },
  { name: "Positive reply",       color: "#10b981", stage_type: "open" },
  { name: "In progress",          color: "#f59e0b", stage_type: "open" },
  { name: "Follow Up",            color: "#6366f1", stage_type: "open" },
  { name: "Booked",               color: "#3b82f6", stage_type: "open" },
  { name: "Not interested/Block", color: "#ef4444", stage_type: "lost" },
  { name: "Lost",                 color: "#dc2626", stage_type: "lost" },
  { name: "Won",                  color: "#059669", stage_type: "won" },
];

export async function fetchPipelines(workspaceId?: string): Promise<Pipeline[]> {
  let q = supabase.from("pipelines").select("*").order("position").order("created_at");
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Pipeline[];
}

export async function createPipeline(
  workspaceId: string,
  input: { name: string; color?: string },
): Promise<Pipeline> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("pipelines")
    .select("position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = (existing?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("pipelines")
    .insert({
      workspace_id: workspaceId,
      user_id: u.user.id,
      name: input.name.trim() || "Untitled board",
      color: input.color || "#6366f1",
      position: nextPos,
      is_default: false,
    })
    .select("*")
    .single();
  if (error) throw error;

  // Seed default stages for the new board
  const stageRows = DEFAULT_STAGES.map((s, i) => ({
    workspace_id: workspaceId,
    user_id: u.user!.id,
    pipeline_id: data!.id,
    name: s.name,
    color: s.color,
    stage_type: s.stage_type,
    position: i,
  }));
  await supabase.from("pipeline_stages").insert(stageRows);

  return data as Pipeline;
}

export async function updatePipeline(id: string, patch: Partial<Pick<Pipeline, "name" | "color" | "position">>) {
  const { error } = await supabase.from("pipelines").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePipeline(id: string, workspaceId: string) {
  // Move any deals/conversations/stages on this board to the default board
  const { data: def } = await supabase
    .from("pipelines")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .maybeSingle();
  if (!def) throw new Error("Default board not found");
  if (def.id === id) throw new Error("Cannot delete the default board");

  // Find first stage on the default board to reassign deals
  const { data: defStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", def.id)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (defStage) {
    await supabase.from("deals").update({ pipeline_id: def.id, stage_id: defStage.id }).eq("pipeline_id", id);
  }
  await supabase.from("conversations").update({ pipeline_id: def.id }).eq("pipeline_id", id);
  await supabase.from("pipeline_stages").delete().eq("pipeline_id", id);

  const { error } = await supabase.from("pipelines").delete().eq("id", id);
  if (error) throw error;
}

/** Make sure there is at least one (default) board for the workspace.
 * Returns the default board id. Idempotent. */
export async function ensureDefaultPipeline(workspaceId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("pipelines")
    .select("id, is_default")
    .eq("workspace_id", workspaceId);
  const def = (existing ?? []).find((p) => p.is_default);
  if (def) return def.id;
  if ((existing ?? []).length > 0) {
    const first = existing![0];
    await supabase.from("pipelines").update({ is_default: true }).eq("id", first.id);
    return first.id;
  }
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("pipelines")
    .insert({
      workspace_id: workspaceId,
      user_id: u.user.id,
      name: "Main",
      color: "#6366f1",
      position: 0,
      is_default: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}
