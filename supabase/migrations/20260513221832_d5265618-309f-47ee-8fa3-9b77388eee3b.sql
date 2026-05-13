-- Broaden negative text regex to include "not relevant", "not for me", "no thanks",
-- "wrong person", and a few more language variants.
CREATE OR REPLACE FUNCTION public._is_negative_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _text IS NOT NULL AND (
    lower(btrim(_text)) ~ '(^|[^a-zа-я])(block|stop|unsubscribe|spam|not\s*relevant|not\s*for\s*me|not\s*interested|no\s*thanks?|no\s*thank\s*you|do\s*not\s*contact|remove\s*me|wrong\s*(person|number)|fuck\s*off|leave\s*me|спам|стоп|отпиш|не\s*интересно|не\s*актуально|не\s*для\s*меня|заблок|αποκλεισμός|δεν\s*είναι\s*για\s*εμάς)([^a-zа-я]|$)'
  );
$$;

-- Auto-reply / OOO heuristic: business away-messages and template bounces.
CREATE OR REPLACE FUNCTION public._is_auto_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _text IS NOT NULL AND (
    lower(btrim(_text)) ~ '(thank\s*you\s*for\s*contacting|thanks\s*for\s*contacting|gracias\s*por\s*comunicarte|we[''\s]*re\s*unavailable|currently\s*away|out\s*of\s*office|auto[-\s]*reply|our\s*office\s*(working|hours)|please\s*let\s*us\s*know\s*how\s*we\s*can\s*(help|assist)|we\s*will\s*respond\s*as\s*soon|απουσ|λειτουργ.{0,12}απ[όο])'
  );
$$;

-- Positive / engaged-buyer heuristic (used when AI classification is not yet available).
CREATE OR REPLACE FUNCTION public._is_positive_reply_text(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _text IS NOT NULL AND (
    -- explicit interest / agreement / questions
    btrim(_text) ~ '\?'
    OR lower(btrim(_text)) ~ '(^|[^a-zа-я])(yes|sure|ok|okay|sounds\s*good|interested|i[''\s]*m\s*interested|tell\s*me\s*more|send\s*(me\s*)?(more\s*)?(info|details)|share\s*details|more\s*info|learn\s*more|how\s*much|what[''\s]*s\s*the\s*price|price|pricing|cost|quote|available|availability|when|where|how|demo|call|book|schedule|meeting|интересно|давай|расскаж|подробнее|сколько|когда|где)([^a-zа-я]|$)'
  );
$$;

-- Canonical gate. Returns true ONLY if the reply is worth notifying the client channel.
CREATE OR REPLACE FUNCTION public.should_notify_lead_reply(_conversation_id uuid, _reply_text text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sentiment text;
  _intent text;
BEGIN
  IF _conversation_id IS NULL THEN RETURN false; END IF;

  -- Hard blocks
  IF public._conversation_is_lost(_conversation_id) THEN RETURN false; END IF;
  IF public._is_negative_reply_text(_reply_text) THEN RETURN false; END IF;
  IF public._is_auto_reply_text(_reply_text) THEN RETURN false; END IF;

  -- If the AI classifier has already tagged this conversation, trust it.
  SELECT reply_sentiment, reply_intent
    INTO _sentiment, _intent
  FROM public.conversation_insights
  WHERE conversation_id = _conversation_id
  ORDER BY tagged_at DESC
  LIMIT 1;

  IF _sentiment IS NOT NULL THEN
    IF _sentiment IN ('not_interested','negative','ooo') THEN RETURN false; END IF;
    IF _intent    IN ('unsubscribe','spam','wrong_person') THEN RETURN false; END IF;
    IF _sentiment IN ('positive','objection') THEN RETURN true; END IF;
    IF _intent    IN ('meeting','pricing','info') THEN RETURN true; END IF;
    -- neutral/other with no positive signal: fall through to text heuristic
  END IF;

  -- No (or ambiguous) classification yet: require positive text signal.
  RETURN public._is_positive_reply_text(_reply_text);
END;
$$;

-- Wire campaign-recipients trigger through the canonical gate.
CREATE OR REPLACE FUNCTION public.enqueue_recipient_first_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF NOT public.should_notify_lead_reply(NEW.conversation_id, _last_msg) THEN
    RETURN NEW;
  END IF;

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

-- Wire lead-imports trigger through the canonical gate too.
CREATE OR REPLACE FUNCTION public.enqueue_lead_first_reply_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _slack_channel text;
  _last_msg text;
BEGIN
  IF NEW.status = 'replied' AND OLD.status = 'sent' THEN
    SELECT c.last_message_text INTO _last_msg
    FROM public.conversations c WHERE c.id = NEW.conversation_id;

    IF NOT public.should_notify_lead_reply(NEW.conversation_id, _last_msg) THEN
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

-- Clean any pending bad events (defensive: should already be empty)
UPDATE public.slack_event_queue
   SET status = 'skipped',
       processed_at = now(),
       error = 'unqualified by should_notify_lead_reply'
 WHERE status = 'pending'
   AND event_type = 'lead.first_reply'
   AND NOT public.should_notify_lead_reply(
     (payload->>'conversation_id')::uuid,
     payload->>'last_message_text'
   );