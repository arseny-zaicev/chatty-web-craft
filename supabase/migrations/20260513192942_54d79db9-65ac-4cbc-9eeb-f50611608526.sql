
-- P0-1: fast lookup for "this conversation has at least one inbound message"
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_has_inbound
  ON public.conversations (workspace_id)
  WHERE last_inbound_at IS NOT NULL;

-- Safety backfill: any conversation with inbound history but a NULL last_inbound_at
-- (e.g. created before the trigger landed). Cheap one-shot.
WITH per_conv AS (
  SELECT m.conversation_id, MAX(m.created_at) AS last_inbound
  FROM public.messages m
  WHERE m.direction::text = 'inbound'
  GROUP BY m.conversation_id
)
UPDATE public.conversations c
   SET last_inbound_at = p.last_inbound
  FROM per_conv p
 WHERE p.conversation_id = c.id
   AND c.last_inbound_at IS NULL;
