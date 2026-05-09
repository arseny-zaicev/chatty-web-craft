import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type WhatsAppNumber = Pick<
  Tables<"whatsapp_numbers">,
  "id" | "phone_number" | "display_name" | "label" | "workspace_id" | "is_active" | "provider_api_key" | "provider_app_id"
>;

/** Friendly, human-facing sender label for use in normal chat UI.
 * Never exposes the technical Gupshup app name (display_name).
 * Order: explicit label -> +phone. */
export const friendlySenderLabel = (n: Pick<WhatsAppNumber, "label" | "phone_number"> | null | undefined) => {
  if (!n) return "WhatsApp";
  const l = n.label?.trim();
  if (l) return l;
  return `+${n.phone_number}`;
};

export type Conversation = Pick<
  Tables<"conversations">,
  | "id"
  | "contact_phone"
  | "contact_name"
  | "last_message_text"
  | "last_message_at"
  | "unread_count"
  | "whatsapp_number_id"
  | "workspace_id"
  | "is_starred"
  | "pinned_at"
  | "assigned_user_id"
  | "active_responder_id"
  | "active_responder_at"
>;

export type Stage = Pick<Tables<"pipeline_stages">, "id" | "name" | "color" | "position" | "stage_type" | "workspace_id">;

export type Deal = Pick<
  Tables<"deals">,
  | "id"
  | "title"
  | "contact_name"
  | "contact_phone"
  | "amount"
  | "currency"
  | "notes"
  | "stage_id"
  | "workspace_id"
  | "position"
  | "conversation_id"
  | "updated_at"
>;

export const crmKeys = {
  base: (workspaceId?: string) => ["crm", "base", workspaceId ?? "all"] as const,
  pipeline: (workspaceId?: string) => ["crm", "pipeline", workspaceId ?? "all"] as const,
  campaigns: (workspaceId?: string) => ["crm", "campaigns", workspaceId ?? "all"] as const,
  allBase: ["crm", "base", "all"] as const,
  allPipeline: ["crm", "pipeline", "all"] as const,
  allCampaigns: ["crm", "campaigns", "all"] as const,
};

export async function fetchCrmBase(workspaceId?: string) {
  let numbersQuery = supabase.from("whatsapp_numbers").select("id, phone_number, display_name, label, workspace_id, is_active, provider_api_key, provider_app_id");
  let conversationsQuery = supabase
    .from("conversations")
    .select(
      "id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id, workspace_id, is_starred, pinned_at, assigned_user_id, active_responder_id, active_responder_at",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (workspaceId) {
    numbersQuery = numbersQuery.eq("workspace_id", workspaceId);
    conversationsQuery = conversationsQuery.eq("workspace_id", workspaceId);
  }

  const [{ data: numbers, error: numbersError }, { data: conversations, error: conversationsError }] =
    await Promise.all([
      numbersQuery,
      conversationsQuery,
    ]);

  if (numbersError) throw numbersError;
  if (conversationsError) throw conversationsError;
  return { numbers: (numbers ?? []) as WhatsAppNumber[], conversations: (conversations ?? []) as Conversation[] };
}

const DEFAULT_WORKSPACE_STAGES: Array<{ name: string; color: string; stage_type: "open" | "won" | "lost" }> = [
  { name: "New chats", color: "#10b981", stage_type: "open" },
  { name: "Qualified", color: "#3b82f6", stage_type: "open" },
  { name: "Follow-up", color: "#f59e0b", stage_type: "open" },
  { name: "Booked", color: "#8b5cf6", stage_type: "open" },
  { name: "Won", color: "#22c55e", stage_type: "won" },
  { name: "Lost", color: "#ef4444", stage_type: "lost" },
];

async function seedDefaultStagesForWorkspace(workspaceId: string): Promise<Stage[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const rows = DEFAULT_WORKSPACE_STAGES.map((s, i) => ({
    workspace_id: workspaceId,
    user_id: u.user!.id,
    name: s.name,
    color: s.color,
    stage_type: s.stage_type,
    position: i,
  }));
  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert(rows)
    .select("id, name, color, position, stage_type, workspace_id");
  if (error) {
    // Race with another tab seeding at the same time -> just refetch
    const { data: again } = await supabase
      .from("pipeline_stages")
      .select("id, name, color, position, stage_type, workspace_id")
      .eq("workspace_id", workspaceId)
      .order("position");
    return (again ?? []) as Stage[];
  }
  return (data ?? []) as Stage[];
}

export async function fetchPipelineBase(workspaceId?: string) {
  let stagesQuery = supabase.from("pipeline_stages").select("id, name, color, position, stage_type, workspace_id").order("position");
  let dealsQuery = supabase
    .from("deals")
    .select("id, title, contact_name, contact_phone, amount, currency, notes, stage_id, workspace_id, position, conversation_id, updated_at")
    .order("position");
  let conversationsQuery = supabase
    .from("conversations")
    .select("id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id, workspace_id, is_starred, pinned_at, assigned_user_id, active_responder_id, active_responder_at");

  if (workspaceId) {
    stagesQuery = stagesQuery.eq("workspace_id", workspaceId);
    dealsQuery = dealsQuery.eq("workspace_id", workspaceId);
    conversationsQuery = conversationsQuery.eq("workspace_id", workspaceId);
  }

  const [stagesRes, dealsRes, convRes] = await Promise.all([stagesQuery, dealsQuery, conversationsQuery]);

  if (stagesRes.error) throw stagesRes.error;
  if (dealsRes.error) throw dealsRes.error;
  if (convRes.error) throw convRes.error;

  let stages = (stagesRes.data ?? []) as Stage[];
  // Auto-seed default stages the first time a workspace pipeline is opened.
  if (workspaceId && stages.length === 0) {
    stages = await seedDefaultStagesForWorkspace(workspaceId);
  }

  return {
    stages,
    deals: (dealsRes.data ?? []) as Deal[],
    conversations: (convRes.data ?? []) as Conversation[],
  };
}

export async function fetchCampaignBase(workspaceId?: string) {
  // Lightweight: numbers + templates + recent campaigns. Conversations fetched lazily via fetchConversationsForCsv.
  let numbersQuery = supabase
    .from("whatsapp_numbers")
    .select("id, phone_number, display_name, label, workspace_id, is_active, provider_api_key, provider_app_id");
  let templatesQuery = supabase
    .from("message_templates")
    .select("id, name, language, status, category, body, whatsapp_number_id, workspace_id, variables, synced_at, provider_template_id, buttons, quality, namespace, external_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, name, status, delay_min_seconds, delay_max_seconds, total_recipients, sent_count, failed_count, created_at, whatsapp_number_id, template_id, workspace_id")
    .order("created_at", { ascending: false })
    .limit(25);

  if (workspaceId) {
    numbersQuery = numbersQuery.eq("workspace_id", workspaceId);
    templatesQuery = templatesQuery.eq("workspace_id", workspaceId);
    campaignsQuery = campaignsQuery.eq("workspace_id", workspaceId);
  }

  const [numbersRes, templatesRes, campaignsRes] = await Promise.all([numbersQuery, templatesQuery, campaignsQuery]);
  if (numbersRes.error) throw numbersRes.error;
  if (templatesRes.error) throw templatesRes.error;
  if (campaignsRes.error) throw campaignsRes.error;

  return {
    numbers: (numbersRes.data ?? []) as WhatsAppNumber[],
    templates: templatesRes.data ?? [],
    campaigns: campaignsRes.data ?? [],
    conversations: [] as Conversation[],
  };
}

export async function fetchConversationsForCsv(workspaceId?: string, limit = 200) {
  let q = supabase
    .from("conversations")
    .select("id, contact_phone, contact_name, last_message_at, whatsapp_number_id, workspace_id")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
