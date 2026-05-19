import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type WhatsAppNumber = Pick<
  Tables<"whatsapp_numbers">,
  "id" | "phone_number" | "display_name" | "label" | "workspace_id" | "is_active" | "provider_api_key" | "provider_app_id"
>;

/** Friendly, human-facing sender label for use in normal chat UI.
 * Shows the operator/profile name (display_name) with phone fallback.
 * `label` is an internal fleet/admin handle (e.g. "01Ashik02") and must NOT
 * appear in operator-facing chat UI.
 * Order: display_name -> +phone. */
export const friendlySenderLabel = (n: Pick<WhatsAppNumber, "display_name" | "phone_number"> | null | undefined) => {
  if (!n) return "WhatsApp";
  const d = n.display_name?.trim();
  if (d) return d;
  return `+${n.phone_number}`;
};

/** Operator-facing FULL sender identifier. Used in template inspection, launch
 * sender picker, CRM/inbox headers — anywhere an operator may need to copy the
 * exact number, Gupshup app id, or fleet label into another tool.
 * Always shows full +E.164 phone; no truncation of app_id; only omits null fields. */
export const senderFullLabel = (
  n: Pick<WhatsAppNumber, "display_name" | "phone_number" | "provider_app_id" | "label"> | null | undefined,
): string => {
  if (!n) return "WhatsApp";
  const parts: string[] = [`+${n.phone_number}`];
  const d = n.display_name?.trim();
  if (d) parts.push(d);
  const app = n.provider_app_id?.trim();
  if (app) parts.push(`app:${app}`);
  const lbl = n.label?.trim();
  if (lbl) parts.push(`fleet:${lbl}`);
  return parts.join(" · ");
};

export type Conversation = Pick<
  Tables<"conversations">,
  | "id"
  | "contact_phone"
  | "contact_name"
  | "last_message_text"
  | "last_message_at"
  | "last_inbound_at"
  | "unread_count"
  | "whatsapp_number_id"
  | "workspace_id"
  | "is_starred"
  | "pinned_at"
  | "assigned_user_id"
  | "active_responder_id"
  | "active_responder_at"
> & { pipeline_id: string | null };

export type Stage = Pick<Tables<"pipeline_stages">, "id" | "name" | "color" | "position" | "stage_type" | "workspace_id"> & { pipeline_id: string | null };

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
> & { pipeline_id: string | null };

export const crmKeys = {
  base: (workspaceId?: string) => ["crm", "base", workspaceId ?? "all"] as const,
  pipeline: (workspaceId?: string, pipelineId?: string | null) =>
    ["crm", "pipeline", workspaceId ?? "all", pipelineId ?? "all"] as const,
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
      "id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id, workspace_id, is_starred, pinned_at, assigned_user_id, active_responder_id, active_responder_at, pipeline_id",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    // Cap initial load to 1000 most-recent conversations. Older ones are
    // discoverable via server-side search (see searchConversations).
    .limit(1000);

  if (workspaceId) {
    numbersQuery = numbersQuery.eq("workspace_id", workspaceId);
    conversationsQuery = conversationsQuery.eq("workspace_id", workspaceId);
  }

  let dealsQuery = supabase
    .from("deals")
    .select("conversation_id, stage_id, workspace_id")
    .limit(5000);
  let stagesQuery = supabase
    .from("pipeline_stages")
    .select("id, stage_type, workspace_id")
    .limit(2000);
  if (workspaceId) {
    dealsQuery = dealsQuery.eq("workspace_id", workspaceId);
    stagesQuery = stagesQuery.eq("workspace_id", workspaceId);
  }

  const [
    { data: numbers, error: numbersError },
    { data: conversations, error: conversationsError },
    { data: deals, error: dealsError },
    { data: stages, error: stagesError },
  ] = await Promise.all([numbersQuery, conversationsQuery, dealsQuery, stagesQuery]);

  if (numbersError) throw numbersError;
  if (conversationsError) throw conversationsError;
  if (dealsError) throw dealsError;
  if (stagesError) throw stagesError;

  // Map conversation_id -> stage_type ("open" | "won" | "lost")
  const stageTypeById = new Map<string, string>();
  (stages ?? []).forEach((s: any) => stageTypeById.set(s.id, s.stage_type));
  const conversationStageType = new Map<string, string>();
  (deals ?? []).forEach((d: any) => {
    if (!d.conversation_id || !d.stage_id) return;
    const t = stageTypeById.get(d.stage_id);
    if (t) conversationStageType.set(d.conversation_id, t);
  });

  // Set of conversation ids that have at least one inbound message (i.e. contact replied).
  // Backed by conversations.last_inbound_at (maintained by trigger) so this is one
  // small index lookup, not a 20k-row message scan. Accurate across the whole workspace
  // even when older threads are not in the initial 1000-row batch.
  const repliedConversationIds = new Set<string>();
  let repliedQuery = supabase
    .from("conversations")
    .select("id")
    .not("last_inbound_at", "is", null)
    .limit(50000);
  if (workspaceId) repliedQuery = repliedQuery.eq("workspace_id", workspaceId);
  const { data: repliedRows } = await repliedQuery;
  (repliedRows ?? []).forEach((r: any) => r.id && repliedConversationIds.add(r.id));

  return {
    numbers: (numbers ?? []) as WhatsAppNumber[],
    conversations: (conversations ?? []) as Conversation[],
    conversationStageType,
    repliedConversationIds,
  };
}

const DEFAULT_WORKSPACE_STAGES: Array<{ name: string; color: string; stage_type: "open" | "won" | "lost" }> = [
  { name: "Message sent",         color: "#64748b", stage_type: "open" },
  { name: "Other Reply",          color: "#94a3b8", stage_type: "open" },
  { name: "Positive reply",       color: "#10b981", stage_type: "open" },
  { name: "In progress",          color: "#f59e0b", stage_type: "open" },
  { name: "1st Call Attempt",     color: "#fbbf24", stage_type: "open" },
  { name: "2nd Call Attempt",     color: "#fb923c", stage_type: "open" },
  { name: "3rd Call Attempt",     color: "#f97316", stage_type: "open" },
  { name: "Follow Up",            color: "#6366f1", stage_type: "open" },
  { name: "Not interested/Block", color: "#ef4444", stage_type: "lost" },
  { name: "Booked",               color: "#3b82f6", stage_type: "open" },
  { name: "Lost",                 color: "#dc2626", stage_type: "lost" },
  { name: "Won",                  color: "#059669", stage_type: "won" },
];

async function seedDefaultStagesForWorkspace(workspaceId: string): Promise<Stage[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  // Ensure a default board exists; new stages must belong to it.
  const { ensureDefaultPipeline } = await import("./pipelines");
  const pipelineId = await ensureDefaultPipeline(workspaceId);
  const rows = DEFAULT_WORKSPACE_STAGES.map((s, i) => ({
    workspace_id: workspaceId,
    user_id: u.user!.id,
    pipeline_id: pipelineId,
    name: s.name,
    color: s.color,
    stage_type: s.stage_type,
    position: i,
  }));
  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert(rows)
    .select("id, name, color, position, stage_type, workspace_id, pipeline_id");
  if (error) {
    const { data: again } = await supabase
      .from("pipeline_stages")
      .select("id, name, color, position, stage_type, workspace_id, pipeline_id")
      .eq("workspace_id", workspaceId)
      .order("position");
    return (again ?? []) as Stage[];
  }
  return (data ?? []) as Stage[];
}

export async function fetchPipelineBase(workspaceId?: string, pipelineId?: string | null) {
  let stagesQuery = supabase.from("pipeline_stages").select("id, name, color, position, stage_type, workspace_id, pipeline_id").order("position");
  let dealsQuery = supabase
    .from("deals")
    .select("id, title, contact_name, contact_phone, amount, currency, notes, stage_id, workspace_id, position, conversation_id, updated_at, pipeline_id")
    .order("position");
  let conversationsQuery = supabase
    .from("conversations")
    .select("id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id, workspace_id, is_starred, pinned_at, assigned_user_id, active_responder_id, active_responder_at, pipeline_id");

  if (workspaceId) {
    stagesQuery = stagesQuery.eq("workspace_id", workspaceId);
    dealsQuery = dealsQuery.eq("workspace_id", workspaceId);
    conversationsQuery = conversationsQuery.eq("workspace_id", workspaceId);
  }
  if (pipelineId) {
    stagesQuery = stagesQuery.eq("pipeline_id", pipelineId);
    dealsQuery = dealsQuery.eq("pipeline_id", pipelineId);
    // Conversations are not filtered by pipeline here — Pipeline.tsx only uses
    // conversations for assignee/responder lookup, which is independent of pipeline.
  }

  const [stagesRes, dealsRes, convRes] = await Promise.all([stagesQuery, dealsQuery, conversationsQuery]);

  if (stagesRes.error) throw stagesRes.error;
  if (dealsRes.error) throw dealsRes.error;
  if (convRes.error) throw convRes.error;

  let stages = (stagesRes.data ?? []) as Stage[];
  // Auto-seed default stages the first time a workspace pipeline is opened.
  if (workspaceId && !pipelineId && stages.length === 0) {
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
