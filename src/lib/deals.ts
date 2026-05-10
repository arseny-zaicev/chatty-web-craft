// Deal mutations. UI components (Pipeline) must use these helpers instead of
// touching `supabase.from("deals")` directly.

import { supabase } from "@/integrations/supabase/client";

export type NewDealInput = {
  userId: string;
  workspaceId: string | null;
  title: string;
  contactName?: string | null;
  contactPhone?: string | null;
  amount?: number | null;
  stageId: string;
  position: number;
  pipelineId?: string | null;
};

export async function createDeal(input: NewDealInput) {
  const { error } = await supabase.from("deals").insert({
    user_id: input.userId,
    workspace_id: input.workspaceId,
    title: input.title,
    contact_name: input.contactName ?? null,
    contact_phone: input.contactPhone ?? null,
    amount: input.amount ?? null,
    stage_id: input.stageId,
    position: input.position,
    pipeline_id: input.pipelineId ?? null,
  });
  if (error) throw error;
}

export type DealPatch = {
  title?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  amount?: number | null;
  notes?: string | null;
  stage_id?: string;
  position?: number;
};

export async function updateDeal(id: string, patch: DealPatch) {
  const { error } = await supabase.from("deals").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDeal(id: string) {
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) throw error;
}

export async function moveDeal(id: string, stageId: string, position: number) {
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: stageId, position })
    .eq("id", id);
  if (error) throw error;
}
