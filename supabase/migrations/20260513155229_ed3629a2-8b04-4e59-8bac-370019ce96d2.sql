CREATE OR REPLACE FUNCTION public.pending_classification_conversations(_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, workspace_id uuid, contact_phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.workspace_id, c.contact_phone
  FROM public.conversations c
  WHERE EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = c.id AND m.direction::text = 'inbound'
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_insights ci WHERE ci.conversation_id = c.id
  )
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;