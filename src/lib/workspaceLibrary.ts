import { supabase } from "@/integrations/supabase/client";

export type LibraryFieldType = "text" | "long_text" | "link";

export type LibraryField = {
  id: string;
  workspace_id: string;
  key: string;
  label: string;
  type: LibraryFieldType;
  value: string | null;
  is_builtin: boolean;
  position: number;
};

export type SavedReply = {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  body: string;
  folder: string | null;
  tags: string[];
  is_favorite: boolean;
  last_used_at: string | null;
  position: number;
};

/** Built-in core link/asset fields. Always shown in Library section B,
 * even if no row exists yet — first save inserts the row. */
export const BUILTIN_FIELDS: { key: string; label: string; type: LibraryFieldType }[] = [
  { key: "website_url", label: "Website URL", type: "link" },
  { key: "booking_url", label: "Booking URL", type: "link" },
  { key: "case_study_url", label: "Case Study URL", type: "link" },
  { key: "pricing_url", label: "Pricing URL", type: "link" },
  { key: "offer_summary", label: "Offer Summary", type: "long_text" },
  { key: "cta_text", label: "CTA Text", type: "text" },
];

export const libraryKeys = {
  fields: (wsId: string) => ["wlib", "fields", wsId] as const,
  replies: (wsId: string) => ["wlib", "replies", wsId] as const,
};

export async function fetchLibraryFields(workspaceId: string): Promise<LibraryField[]> {
  const { data, error } = await supabase
    .from("workspace_library_fields")
    .select("id, workspace_id, key, label, type, value, is_builtin, position")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LibraryField[];
}

export async function fetchSavedReplies(workspaceId: string): Promise<SavedReply[]> {
  const { data, error } = await supabase
    .from("workspace_saved_replies")
    .select("id, workspace_id, user_id, title, body, folder, tags, is_favorite, last_used_at, position")
    .eq("workspace_id", workspaceId)
    .order("is_favorite", { ascending: false })
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SavedReply[];
}

/** Replace {key} placeholders with values from library fields.
 * Unknown keys are left as-is so the operator can spot missing data. */
export function expandTemplate(body: string, fields: LibraryField[]): string {
  if (!body) return body;
  const map = new Map(fields.map((f) => [f.key, f.value ?? ""]));
  return body.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, key) => (map.has(key) ? (map.get(key) as string) : full));
}
