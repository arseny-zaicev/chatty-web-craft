-- 1. Workspace flag for inbox alerts
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS inbox_alerts_enabled boolean NOT NULL DEFAULT false;

-- 2. Event queue
CREATE TABLE IF NOT EXISTS public.slack_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  workspace_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_slack_event_queue_pending
  ON public.slack_event_queue (created_at)
  WHERE status = 'pending';

ALTER TABLE public.slack_event_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages slack queue" ON public.slack_event_queue;
CREATE POLICY "service role manages slack queue"
  ON public.slack_event_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "admins view slack queue" ON public.slack_event_queue;
CREATE POLICY "admins view slack queue"
  ON public.slack_event_queue FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- 3. Trigger: campaigns status changes
CREATE OR REPLACE FUNCTION public.enqueue_campaign_slack_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _payload jsonb;
BEGIN
  -- Only react to actual status transitions
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'scheduled' THEN
      _event := 'campaign_scheduled';
    ELSIF NEW.status = 'running' THEN
      _event := 'campaign_launched';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
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
END $$;

DROP TRIGGER IF EXISTS trg_campaign_slack_event ON public.campaigns;
CREATE TRIGGER trg_campaign_slack_event
  AFTER INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_campaign_slack_event();

-- 4. Trigger: whatsapp_numbers status changes (restricted/blocked/quality)
CREATE OR REPLACE FUNCTION public.enqueue_number_slack_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _payload jsonb;
BEGIN
  -- Status transition (e.g., active -> restricted -> blocked)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := CASE NEW.status::text
      WHEN 'restricted' THEN 'number_restricted'
      WHEN 'blocked'    THEN 'number_blocked'
      WHEN 'active'     THEN CASE WHEN OLD.status::text IN ('restricted','blocked') THEN 'number_recovered' ELSE NULL END
      ELSE NULL
    END;
  END IF;

  -- Quality changes (messaging_limit / display_name_status)
  IF _event IS NULL AND NEW.messaging_limit IS DISTINCT FROM OLD.messaging_limit
     AND NEW.messaging_limit IS NOT NULL THEN
    _event := 'number_quality_changed';
  END IF;

  IF _event IS NULL THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'number_id', NEW.id,
    'phone_number', NEW.phone_number,
    'display_name', NEW.display_name,
    'country_code', NEW.country_code,
    'status', NEW.status,
    'previous_status', OLD.status,
    'messaging_limit', NEW.messaging_limit,
    'previous_messaging_limit', OLD.messaging_limit,
    'restricted_at', NEW.restricted_at,
    'bm_name', NEW.bm_name
  );

  INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
  VALUES (_event, NEW.workspace_id, _payload);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_number_slack_event ON public.whatsapp_numbers;
CREATE TRIGGER trg_number_slack_event
  AFTER UPDATE ON public.whatsapp_numbers
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_number_slack_event();