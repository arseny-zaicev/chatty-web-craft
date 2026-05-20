// Quick-reply template groups exposed in the inbox composer.
// Admin-curated whitelist of `template_groups` per workspace.

import { supabase } from "@/integrations/supabase/client";
import { fetchTemplateGroups, type TemplateGroup } from "@/lib/launchData";

export type QuickTemplateGroup = {
  id: string;
  workspace_id: string;
  template_group_id: string;
  label: string | null;
  position: number;
};

export const quickTemplatesKey = {
  list: (workspaceId: string) => ["quick-template-groups", workspaceId] as const,
};

export async function fetchQuickTemplateGroups(workspaceId: string): Promise<QuickTemplateGroup[]> {
  const { data, error } = await supabase
    .from("workspace_quick_template_groups")
    .select("id, workspace_id, template_group_id, label, position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuickTemplateGroup[];
}

/** Join quick-list with full template_groups rows for label/category/template_names. */
export async function fetchQuickTemplateGroupsResolved(workspaceId: string) {
  const [quick, groups] = await Promise.all([
    fetchQuickTemplateGroups(workspaceId),
    fetchTemplateGroups(workspaceId),
  ]);
  const byId = new Map(groups.map((g) => [g.id, g]));
  return quick
    .map((q) => {
      const g = byId.get(q.template_group_id);
      if (!g) return null;
      return { quick: q, group: g };
    })
    .filter((x): x is { quick: QuickTemplateGroup; group: TemplateGroup } => Boolean(x));
}

export async function addQuickTemplateGroup(input: {
  workspaceId: string;
  templateGroupId: string;
  label?: string | null;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("workspace_quick_template_groups").insert({
    workspace_id: input.workspaceId,
    template_group_id: input.templateGroupId,
    label: input.label?.trim() || null,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function updateQuickTemplateGroup(id: string, patch: { label?: string | null; position?: number }) {
  const { error } = await supabase
    .from("workspace_quick_template_groups")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function removeQuickTemplateGroup(id: string) {
  const { error } = await supabase
    .from("workspace_quick_template_groups")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
