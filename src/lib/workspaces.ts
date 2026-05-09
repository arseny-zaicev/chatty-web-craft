import { supabase } from "@/integrations/supabase/client";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  color: string;
  is_active: boolean;
  owner_user_id: string;
  internal_code: string | null;
};

export const workspaceKeys = {
  list: ["workspaces", "list"] as const,
  bySlug: (slug: string) => ["workspaces", "by-slug", slug] as const,
};

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, slug, color, is_active, owner_user_id")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Workspace[];
}
