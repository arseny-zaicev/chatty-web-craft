-- 1) Helper: compute curfew-shifted timestamp for a pipeline
CREATE OR REPLACE FUNCTION public.pipeline_follow_up_send_at(
  _pipeline_id uuid,
  _base_ts timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz text;
  _curfew time;
  _resume time;
  _local timestamp;
  _local_time time;
  _local_date date;
  _shifted timestamptz;
BEGIN
  SELECT follow_up_timezone, follow_up_curfew_end, follow_up_resume_at
    INTO _tz, _curfew, _resume
  FROM public.pipelines WHERE id = _pipeline_id;
  IF _tz IS NULL THEN
    RETURN _base_ts;
  END IF;

  _local := _base_ts AT TIME ZONE _tz;
  _local_time := _local::time;
  _local_date := _local::date;

  -- If the scheduled local time is at/after curfew_end, push to next day's resume_at.
  IF _local_time >= _curfew THEN
    _shifted := ((_local_date + 1) + _resume)::timestamp AT TIME ZONE _tz;
    RETURN _shifted;
  END IF;
  -- If before resume_at, push to today's resume_at.
  IF _local_time < _resume THEN
    _shifted := (_local_date + _resume)::timestamp AT TIME ZONE _tz;
    RETURN _shifted;
  END IF;
  RETURN _base_ts;
END $$;

-- 2) Trigger on campaign_recipients: when first-touch goes sent, schedule a follow-up.
CREATE OR REPLACE FUNCTION public.schedule_follow_up_on_first_touch_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind text;
  _pipeline_id uuid;
  _p public.pipelines%ROWTYPE;
  _send_at timestamptz;
  _li_id uuid;
BEGIN
  IF NEW.status::text NOT IN ('sent','delivered','read') THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.kind::text, c.pipeline_id INTO _kind, _pipeline_id
  FROM public.campaigns c WHERE c.id = NEW.campaign_id;
  IF _kind <> 'first_touch' OR _pipeline_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _p FROM public.pipelines WHERE id = _pipeline_id;
  IF NOT FOUND OR NOT _p.follow_up_enabled THEN RETURN NEW; END IF;
  IF _p.follow_up_template_id IS NULL AND _p.follow_up_template_group_id IS NULL THEN RETURN NEW; END IF;

  _send_at := public.pipeline_follow_up_send_at(
    _pipeline_id,
    COALESCE(NEW.sent_at, now()) + make_interval(mins => _p.follow_up_delay_minutes)
  );

  SELECT id INTO _li_id FROM public.lead_imports WHERE campaign_recipient_id = NEW.id LIMIT 1;

  INSERT INTO public.pipeline_follow_ups (
    workspace_id, pipeline_id, conversation_id, whatsapp_number_id,
    lead_import_id, first_touch_recipient_id, scheduled_at, status
  ) VALUES (
    NEW.workspace_id, _pipeline_id, NEW.conversation_id, NEW.whatsapp_number_id,
    _li_id, NEW.id, _send_at, 'scheduled'
  )
  ON CONFLICT (conversation_id) WHERE status = 'scheduled' DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_schedule_follow_up_on_sent ON public.campaign_recipients;
CREATE TRIGGER trg_schedule_follow_up_on_sent
AFTER INSERT OR UPDATE OF status ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.schedule_follow_up_on_first_touch_sent();

-- 3) Cancel follow-ups when an inbound message arrives.
CREATE OR REPLACE FUNCTION public.cancel_follow_up_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction::text <> 'inbound' THEN RETURN NEW; END IF;
  UPDATE public.pipeline_follow_ups
     SET status = 'cancelled',
         cancelled_reason = 'inbound_reply',
         updated_at = now()
   WHERE conversation_id = NEW.conversation_id
     AND status = 'scheduled';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cancel_follow_up_on_inbound ON public.messages;
CREATE TRIGGER trg_cancel_follow_up_on_inbound
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.cancel_follow_up_on_inbound();

-- 4) Cancel follow-ups when a deal moves to a lost/closed stage.
CREATE OR REPLACE FUNCTION public.cancel_follow_up_on_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _stype text;
BEGIN
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;
  SELECT stage_type INTO _stype FROM public.pipeline_stages WHERE id = NEW.stage_id;
  IF _stype IN ('lost','won','closed') THEN
    UPDATE public.pipeline_follow_ups
       SET status = 'cancelled',
           cancelled_reason = 'stage_' || _stype,
           updated_at = now()
     WHERE conversation_id = NEW.conversation_id
       AND status = 'scheduled';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cancel_follow_up_on_stage ON public.deals;
CREATE TRIGGER trg_cancel_follow_up_on_stage
AFTER INSERT OR UPDATE OF stage_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.cancel_follow_up_on_stage_change();

-- 5) Updated_at trigger on pipeline_follow_ups
DROP TRIGGER IF EXISTS set_pipeline_follow_ups_updated_at ON public.pipeline_follow_ups;
CREATE TRIGGER set_pipeline_follow_ups_updated_at
BEFORE UPDATE ON public.pipeline_follow_ups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Index to fetch due rows by number quickly.
CREATE INDEX IF NOT EXISTS idx_follow_ups_due
  ON public.pipeline_follow_ups (scheduled_at)
  WHERE status = 'scheduled';
