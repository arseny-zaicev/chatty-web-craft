
ALTER TABLE public.lead_imports
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_recipient_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS lead_imports_status_pipeline_idx
  ON public.lead_imports (status, pipeline_id, imported_at);

CREATE INDEX IF NOT EXISTS lead_imports_campaign_recipient_idx
  ON public.lead_imports (campaign_recipient_id)
  WHERE campaign_recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaigns_first_touch_idx
  ON public.campaigns (workspace_id, pipeline_id, kind, created_at DESC)
  WHERE kind = 'first_touch';

CREATE OR REPLACE FUNCTION public.guard_lead_imports_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE ok boolean := false;
BEGIN
  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    RAISE EXCEPTION 'lead_imports.pipeline_id is immutable';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  ok := CASE OLD.status
    WHEN 'pending'          THEN NEW.status IN ('queued','skipped','invalid','duplicate')
    WHEN 'awaiting_manual'  THEN NEW.status IN ('queued','skipped','sent','replied','failed')
    WHEN 'queued'           THEN NEW.status IN ('sent','failed','skipped')
    WHEN 'sent'             THEN NEW.status IN ('replied','failed')
    WHEN 'replied'          THEN false
    WHEN 'failed'           THEN NEW.status IN ('queued')
    WHEN 'skipped'          THEN NEW.status IN ('queued')
    WHEN 'invalid'          THEN false
    WHEN 'duplicate'        THEN false
    ELSE true
  END;
  IF NOT ok THEN
    RAISE EXCEPTION 'Illegal lead_imports status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_lead_imports_status ON public.lead_imports;
CREATE TRIGGER trg_guard_lead_imports_status
  BEFORE UPDATE ON public.lead_imports
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_imports_status();

CREATE OR REPLACE FUNCTION public.mirror_recipient_to_lead_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _new_status text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  _new_status := CASE NEW.status::text
    WHEN 'sent'     THEN 'sent'
    WHEN 'failed'   THEN 'failed'
    WHEN 'skipped'  THEN 'skipped'
    ELSE NULL
  END;
  IF _new_status IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.lead_imports
  SET status = _new_status,
      sent_at = CASE WHEN _new_status = 'sent' THEN COALESCE(NEW.sent_at, now()) ELSE sent_at END,
      conversation_id = COALESCE(NEW.conversation_id, conversation_id),
      error = CASE WHEN _new_status = 'failed' THEN NEW.error_message ELSE error END
  WHERE campaign_recipient_id = NEW.id
    AND status IN ('queued','awaiting_manual');
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_mirror_recipient_to_lead_import ON public.campaign_recipients;
CREATE TRIGGER trg_mirror_recipient_to_lead_import
  AFTER UPDATE OF status ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.mirror_recipient_to_lead_import();

CREATE OR REPLACE FUNCTION public.mark_lead_replied_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.direction::text <> 'inbound' THEN
    RETURN NEW;
  END IF;
  UPDATE public.lead_imports
  SET status = 'replied'
  WHERE conversation_id = NEW.conversation_id
    AND status = 'sent';
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_mark_lead_replied_on_inbound ON public.messages;
CREATE TRIGGER trg_mark_lead_replied_on_inbound
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.mark_lead_replied_on_inbound();

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
