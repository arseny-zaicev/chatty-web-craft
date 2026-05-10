
-- Index for fast first-touch dedup lookup by phone within a pipeline
CREATE INDEX IF NOT EXISTS idx_recipients_phone_status
  ON public.campaign_recipients (contact_phone, status);

-- Trigger: when a lead transitions sent -> replied, enqueue a Slack event
CREATE OR REPLACE FUNCTION public.enqueue_lead_first_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slack_channel text;
  _last_msg text;
BEGIN
  IF NEW.status = 'replied' AND OLD.status = 'sent' THEN
    SELECT p.slack_channel_id INTO _slack_channel
    FROM public.pipelines p WHERE p.id = NEW.pipeline_id;

    SELECT c.last_message_text INTO _last_msg
    FROM public.conversations c WHERE c.id = NEW.conversation_id;

    INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
    VALUES (
      'lead.first_reply',
      NEW.workspace_id,
      jsonb_build_object(
        'lead_import_id', NEW.id,
        'pipeline_id', NEW.pipeline_id,
        'conversation_id', NEW.conversation_id,
        'contact_phone', NEW.phone,
        'contact_name', NEW.name,
        'last_message_text', _last_msg,
        'slack_channel_id', _slack_channel,
        'payload', NEW.payload
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_lead_first_reply_event ON public.lead_imports;
CREATE TRIGGER trg_enqueue_lead_first_reply_event
AFTER UPDATE OF status ON public.lead_imports
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_lead_first_reply_event();
