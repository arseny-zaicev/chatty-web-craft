
-- 1. Add sent_by_user_id to messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_messages_sent_by_user_id ON public.messages (sent_by_user_id);

-- 2. Backfill conversations.workspace_id from the assigned WhatsApp number
UPDATE public.conversations c
SET workspace_id = n.workspace_id
FROM public.whatsapp_numbers n
WHERE c.workspace_id IS NULL
  AND c.whatsapp_number_id = n.id
  AND n.workspace_id IS NOT NULL;

-- 3. Trigger: any new/updated conversation gets workspace_id from its number if missing
CREATE OR REPLACE FUNCTION public.fill_conversation_workspace_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.whatsapp_number_id IS NOT NULL THEN
    SELECT n.workspace_id INTO NEW.workspace_id
    FROM public.whatsapp_numbers n
    WHERE n.id = NEW.whatsapp_number_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_conversation_workspace_id ON public.conversations;
CREATE TRIGGER trg_fill_conversation_workspace_id
BEFORE INSERT OR UPDATE OF whatsapp_number_id ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.fill_conversation_workspace_id();
