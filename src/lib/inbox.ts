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

/**
 * Loads the most recent ~50 messages for a conversation.
 * We fetch in descending order with a hard limit, then reverse for chronological display,
 * so opening a long-running thread no longer pulls thousands of rows.
 */
export async function fetchConversationMessages(conversationId: string, limit = 500) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, body, media_url, status, created_at, sent_by_user_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).slice().reverse();
}

/**
 * Server-side conversation search across an entire workspace.
 * Used when the local in-memory list (most-recent N) doesn't contain a chat
 * the user is looking for via Slack notification, manual search, etc.
 */
export async function searchConversations(opts: {
  workspaceId?: string;
  query: string;
  limit?: number;
}) {
  const q = opts.query.trim();
  if (!q) return [];
  const limit = Math.min(opts.limit ?? 50, 200);
  const digits = q.replace(/\D/g, "");
  let req = supabase
    .from("conversations")
    .select(
      "id, contact_phone, contact_name, last_message_text, last_message_at, unread_count, whatsapp_number_id, workspace_id, is_starred, pinned_at, assigned_user_id, active_responder_id, active_responder_at, pipeline_id",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (opts.workspaceId) req = req.eq("workspace_id", opts.workspaceId);

  // Build OR filter: phone digits, name, last message body. Conversation id
  // exact match handled separately via maybeSingle.
  const ors: string[] = [];
  if (digits.length >= 4) ors.push(`contact_phone.ilike.%${digits}%`);
  const safe = q.replace(/[%,]/g, " ");
  ors.push(`contact_name.ilike.%${safe}%`);
  ors.push(`last_message_text.ilike.%${safe}%`);
  req = req.or(ors.join(","));
  const { data, error } = await req;
  if (error) throw error;
  return data ?? [];
}
