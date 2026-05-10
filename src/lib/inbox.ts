// Inbox-side mutations. UI components must call these helpers instead of
// touching `supabase.from("conversations")` directly.

import { supabase } from "@/integrations/supabase/client";

export async function setConversationStarred(id: string, starred: boolean) {
  const { error } = await supabase.from("conversations").update({ is_starred: starred }).eq("id", id);
  if (error) throw error;
}

export async function setConversationPinned(id: string, pinnedAt: string | null) {
  const { error } = await supabase.from("conversations").update({ pinned_at: pinnedAt }).eq("id", id);
  if (error) throw error;
}

export async function markConversationUnread(id: string, currentUnread: number) {
  const { error } = await supabase
    .from("conversations")
    .update({ unread_count: Math.max(1, currentUnread) })
    .eq("id", id);
  if (error) throw error;
}

export async function markConversationRead(id: string) {
  const { error } = await supabase.from("conversations").update({ unread_count: 0 }).eq("id", id);
  if (error) throw error;
}

/** Mark `userId` as the active responder on a conversation right now. */
export async function touchResponder(conversationId: string, userId: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ active_responder_id: userId, active_responder_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function fetchConversationMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, body, media_url, status, created_at, sent_by_user_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
