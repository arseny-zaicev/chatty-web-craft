
-- Fire lead.first_reply Slack event directly from campaign_recipients,
-- because mirror_recipient_to_lead_import does NOT propagate the 'replied'
-- status, and many campaign-only contacts have no lead_imports row at all.
-- Without this, replies on campaigns silently bypass Slack notifications.

CREATE OR REPLACE FUNCTION public.enqueue_recipient_first_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slack_channel text;
  _pipeline_id uuid;
  _pipeline_name text;
  _last_msg text;
  _contact_name text;
  _already_queued boolean;
BEGIN
  -- Only on transition into 'replied'
  IF NEW.status::text <> 'replied' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Avoid double-firing if the lead_imports trigger already enqueued this conversation
  SELECT EXISTS (
    SELECT 1 FROM public.slack_event_queue
    WHERE event_type = 'lead.first_reply'
      AND payload->>'conversation_id' = NEW.conversation_id::text
      AND created_at > now() - interval '10 minutes'
  ) INTO _already_queued;
  IF _already_queued THEN
    RETURN NEW;
  END IF;

  SELECT c.last_message_text, c.contact_name, c.pipeline_id
    INTO _last_msg, _contact_name, _pipeline_id
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF _pipeline_id IS NOT NULL THEN
    SELECT p.slack_channel_id, p.name INTO _slack_channel, _pipeline_name
    FROM public.pipelines p WHERE p.id = _pipeline_id;
  END IF;

  INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
  VALUES (
    'lead.first_reply',
    NEW.workspace_id,
    jsonb_build_object(
      'campaign_recipient_id', NEW.id,
      'campaign_id', NEW.campaign_id,
      'pipeline_id', _pipeline_id,
      'pipeline_name', _pipeline_name,
      'conversation_id', NEW.conversation_id,
      'contact_phone', NEW.contact_phone,
      'contact_name', COALESCE(NEW.contact_name, _contact_name),
      'last_message_text', _last_msg,
      'slack_channel_id', _slack_channel,
      'whatsapp_number_id', NEW.whatsapp_number_id,
      'source', 'campaign_recipient'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_recipient_first_reply_event ON public.campaign_recipients;
CREATE TRIGGER trg_enqueue_recipient_first_reply_event
AFTER UPDATE OF status ON public.campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_recipient_first_reply_event();
