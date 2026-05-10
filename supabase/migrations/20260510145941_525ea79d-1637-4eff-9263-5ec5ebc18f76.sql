
CREATE OR REPLACE FUNCTION public.enqueue_positive_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pipeline_slack text;
  _pipeline_name text;
  _last timestamptz;
BEGIN
  IF NEW.is_starred = true AND (OLD.is_starred IS DISTINCT FROM true) THEN
    -- 24h dedup per conversation
    _last := NEW.last_auto_positive_alert_at;
    IF _last IS NOT NULL AND now() - _last < interval '24 hours' THEN
      RETURN NEW;
    END IF;

    IF NEW.pipeline_id IS NOT NULL THEN
      SELECT slack_channel_id, name
        INTO _pipeline_slack, _pipeline_name
      FROM public.pipelines
      WHERE id = NEW.pipeline_id;
    END IF;

    INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
    VALUES (
      'positive_lead',
      NEW.workspace_id,
      jsonb_build_object(
        'conversation_id', NEW.id,
        'contact_phone', NEW.contact_phone,
        'contact_name', NEW.contact_name,
        'last_message_text', NEW.last_message_text,
        'whatsapp_number_id', NEW.whatsapp_number_id,
        'pipeline_id', NEW.pipeline_id,
        'pipeline_name', _pipeline_name,
        'slack_channel_id', _pipeline_slack,
        'source', 'manual_star'
      )
    );

    UPDATE public.conversations
    SET last_auto_positive_alert_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
