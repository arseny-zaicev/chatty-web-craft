-- 0) Delete duplicate lead.first_reply rows, keep the earliest per conversation
DELETE FROM public.slack_event_queue q
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY payload->>'conversation_id'
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.slack_event_queue
  WHERE event_type = 'lead.first_reply'
    AND payload ? 'conversation_id'
) d
WHERE q.id = d.id AND d.rn > 1;

-- 1) lead_imports trigger: add dedupe + race-safe insert
CREATE OR REPLACE FUNCTION public.enqueue_lead_first_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _slack_channel text;
  _last_msg text;
  _already_queued boolean;
BEGIN
  IF NEW.status = 'replied' AND OLD.status = 'sent' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.slack_event_queue
      WHERE event_type = 'lead.first_reply'
        AND payload->>'conversation_id' = NEW.conversation_id::text
        AND created_at > now() - interval '10 minutes'
    ) INTO _already_queued;
    IF _already_queued THEN RETURN NEW; END IF;

    SELECT c.last_message_text INTO _last_msg
    FROM public.conversations c WHERE c.id = NEW.conversation_id;

    IF NOT public.should_notify_lead_reply(NEW.conversation_id, _last_msg) THEN
      RETURN NEW;
    END IF;

    SELECT p.slack_channel_id INTO _slack_channel
    FROM public.pipelines p WHERE p.id = NEW.pipeline_id;

    BEGIN
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
          'source', 'lead_import',
          'payload', NEW.payload
        )
      );
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) recipient trigger: wrap insert so the new unique index doesn't blow it up
CREATE OR REPLACE FUNCTION public.enqueue_recipient_first_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _slack_channel text;
  _pipeline_id uuid;
  _pipeline_name text;
  _last_msg text;
  _contact_name text;
  _already_queued boolean;
BEGIN
  IF NEW.status::text <> 'replied' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.slack_event_queue
    WHERE event_type = 'lead.first_reply'
      AND payload->>'conversation_id' = NEW.conversation_id::text
      AND created_at > now() - interval '10 minutes'
  ) INTO _already_queued;
  IF _already_queued THEN RETURN NEW; END IF;

  SELECT c.last_message_text, c.contact_name, c.pipeline_id
    INTO _last_msg, _contact_name, _pipeline_id
  FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF NOT public.should_notify_lead_reply(NEW.conversation_id, _last_msg) THEN
    RETURN NEW;
  END IF;

  IF _pipeline_id IS NOT NULL THEN
    SELECT p.slack_channel_id, p.name INTO _slack_channel, _pipeline_name
    FROM public.pipelines p WHERE p.id = _pipeline_id;
  END IF;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

-- 3) Race-safe partial unique index (one notification per conversation, ever)
CREATE UNIQUE INDEX IF NOT EXISTS slack_event_queue_lead_first_reply_unique
  ON public.slack_event_queue ((payload->>'conversation_id'))
  WHERE event_type = 'lead.first_reply' AND payload ? 'conversation_id';