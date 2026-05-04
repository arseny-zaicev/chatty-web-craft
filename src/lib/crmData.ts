import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type WhatsAppNumber = Pick<
  Tables<"whatsapp_numbers">,
  "id" | "phone_number" | "display_name" | "workspace_id"
>;

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
  let numbersQuery = supabase.from("whatsapp_numbers").select("id, phone_number, display_name, workspace_id");
  let conversationsQuery = supabase
    .from("conversations")
    .select(
      "id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id, workspace_id, is_starred, pinned_at",
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

export async function fetchPipelineBase() {
  const [{ data: stages, error: stagesError }, { data: deals, error: dealsError }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, color, position, stage_type").order("position"),
    supabase
      .from("deals")
      .select("id, title, contact_name, contact_phone, amount, currency, notes, stage_id, position, conversation_id, updated_at")
      .order("position"),
  ]);

  if (stagesError) throw stagesError;
  if (dealsError) throw dealsError;
  return { stages: (stages ?? []) as Stage[], deals: (deals ?? []) as Deal[] };
}

export async function fetchCampaignBase() {
  const [crmBase, { data: templates, error: templatesError }, { data: campaigns, error: campaignsError }] =
    await Promise.all([
      fetchCrmBase(),
      supabase
        .from("message_templates")
        .select("id, name, language, status, category, body, whatsapp_number_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("campaigns")
        .select("id, name, status, delay_min_seconds, delay_max_seconds, total_recipients, sent_count, failed_count, created_at, whatsapp_number_id, template_id")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  if (templatesError) throw templatesError;
  if (campaignsError) throw campaignsError;
  return { ...crmBase, templates: templates ?? [], campaigns: campaigns ?? [] };
}