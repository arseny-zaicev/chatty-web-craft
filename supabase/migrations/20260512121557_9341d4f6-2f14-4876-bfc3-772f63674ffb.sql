ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS today_recipients_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recipient_country text,
  ADD COLUMN IF NOT EXISTS first_scheduled_at timestamptz;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_slack_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _event text; _payload jsonb;
BEGIN
  IF NEW.kind = 'first_touch' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'scheduled' THEN _event := 'campaign_scheduled';
    ELSIF NEW.status = 'running' THEN _event := 'campaign_launched';
    ELSE RETURN NEW;
    END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    _event := CASE NEW.status
      WHEN 'running'   THEN CASE WHEN OLD.status = 'paused' THEN 'campaign_resumed' ELSE 'campaign_launched' END
      WHEN 'paused'    THEN 'campaign_paused'
      WHEN 'completed' THEN 'campaign_completed'
      WHEN 'cancelled' THEN 'campaign_cancelled'
      WHEN 'scheduled' THEN 'campaign_scheduled'
      WHEN 'failed'    THEN 'campaign_failed'
      ELSE NULL
    END;
    IF _event IS NULL THEN RETURN NEW; END IF;
  END IF;
  _payload := jsonb_build_object(
    'campaign_id', NEW.id,
    'campaign_name', NEW.name,
    'whatsapp_number_id', NEW.whatsapp_number_id,
    'total_recipients', NEW.total_recipients,
    'today_recipients_count', NEW.today_recipients_count,
    'recipient_country', NEW.recipient_country,
    'first_scheduled_at', NEW.first_scheduled_at,
    'sent_count', NEW.sent_count,
    'failed_count', NEW.failed_count,
    'scheduled_start_at', NEW.scheduled_start_at,
    'scheduled_dates', to_jsonb(NEW.scheduled_dates),
    'window_start', NEW.schedule_window_start,
    'window_end', NEW.schedule_window_end,
    'recurrence', NEW.recurrence,
    'status', NEW.status,
    'previous_status', CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END
  );
  INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
  VALUES (_event, NEW.workspace_id, _payload);
  RETURN NEW;
END $function$;