-- 1. Delete duplicate inbound messages (keep earliest of each provider_message_id)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY provider_message_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.messages
  WHERE direction = 'inbound' AND provider_message_id IS NOT NULL
)
DELETE FROM public.messages m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2. Partial unique index to prevent future duplicates (inbound only — outbound may legitimately have nulls or differ)
CREATE UNIQUE INDEX IF NOT EXISTS messages_inbound_provider_message_id_uniq
  ON public.messages (provider_message_id)
  WHERE direction = 'inbound' AND provider_message_id IS NOT NULL;
