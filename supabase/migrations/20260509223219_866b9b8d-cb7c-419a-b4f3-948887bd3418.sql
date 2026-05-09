
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS last_inbox_spike_alert_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_positive_lead_alert_at timestamptz;

-- Positive lead trigger: fires when a conversation gets starred (manual positive marker)
CREATE OR REPLACE FUNCTION public.enqueue_positive_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_starred = true AND (OLD.is_starred IS DISTINCT FROM true) THEN
    INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
    VALUES (
      'positive_lead',
      NEW.workspace_id,
      jsonb_build_object(
        'conversation_id', NEW.id,
        'contact_phone', NEW.contact_phone,
        'contact_name', NEW.contact_name,
        'last_message_text', NEW.last_message_text,
        'whatsapp_number_id', NEW.whatsapp_number_id
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conversations_positive_lead ON public.conversations;
CREATE TRIGGER trg_conversations_positive_lead
AFTER UPDATE OF is_starred ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_positive_lead_event();
