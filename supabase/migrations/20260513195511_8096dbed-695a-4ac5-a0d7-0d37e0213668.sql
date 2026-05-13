
-- Skip Slack 'lead.first_reply' notifications when the reply is a negative
-- quick-reply (Block / Not interested / Stop / Unsubscribe / Спам / etc.)
-- or when the conversation is currently sitting in a 'lost' pipeline stage.
-- Without this, every campaign Block-button press pings the client channel.

CREATE OR REPLACE FUNCTION public._is_negative_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _text IS NOT NULL AND (
    lower(btrim(_text)) ~ '(^|[^a-zа-я])(block|stop|unsubscribe|spam|not\s*interested|do\s*not\s*contact|remove\s*me|спам|стоп|отпиш|не\s*интересно|заблок)([^a-zа-я]|$)'
  );
$$;

CREATE OR REPLACE FUNCTION public._conversation_is_lost(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deals d
    JOIN public.pipeline_stages s ON s.id = d.stage_id
    WHERE d.conversation_id = _conversation_id
      AND s.stage_type = 'lost'
  );
$$;

-- Recipient-level trigger: add the same negative filter.
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

  -- Drop negative button replies + already-lost conversations
  IF public._is_negative_reply_text(_last_msg) THEN RETURN NEW; END IF;
  IF public._conversation_is_lost(NEW.conversation_id) THEN RETURN NEW; END IF;

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

-- Lead-imports trigger: same filter.
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
    SELECT c.last_message_text INTO _last_msg
    FROM public.conversations c WHERE c.id = NEW.conversation_id;

    IF public._is_negative_reply_text(_last_msg) THEN RETURN NEW; END IF;
    IF NEW.conversation_id IS NOT NULL
       AND public._conversation_is_lost(NEW.conversation_id) THEN
      RETURN NEW;
    END IF;

    SELECT p.slack_channel_id INTO _slack_channel
    FROM public.pipelines p WHERE p.id = NEW.pipeline_id;

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

-- Drop already-queued (pending) negative first_reply events so the queue
-- doesn't keep firing Block notifications now that the filter is in place.
UPDATE public.slack_event_queue q
SET status = 'skipped',
    processed_at = now(),
    error = 'suppressed: negative quick-reply'
WHERE q.event_type = 'lead.first_reply'
  AND q.status = 'pending'
  AND public._is_negative_reply_text(q.payload->>'last_message_text');

UPDATE public.slack_event_queue q
SET status = 'skipped',
    processed_at = now(),
    error = 'suppressed: conversation in lost stage'
WHERE q.event_type = 'lead.first_reply'
  AND q.status = 'pending'
  AND (q.payload->>'conversation_id') IS NOT NULL
  AND public._conversation_is_lost((q.payload->>'conversation_id')::uuid);
