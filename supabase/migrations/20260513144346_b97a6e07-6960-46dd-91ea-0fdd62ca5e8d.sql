CREATE OR REPLACE FUNCTION public.dubai_start_of_day(_at timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (((_at AT TIME ZONE 'Asia/Dubai')::date)::timestamp AT TIME ZONE 'Asia/Dubai');
$$;

UPDATE public.whatsapp_message_events e
SET workspace_id       = COALESCE(e.workspace_id, cr.workspace_id),
    whatsapp_number_id = COALESCE(e.whatsapp_number_id, cr.whatsapp_number_id)
FROM public.campaign_recipients cr
WHERE (e.workspace_id IS NULL OR e.whatsapp_number_id IS NULL)
  AND (
    (e.campaign_recipient_id IS NOT NULL AND e.campaign_recipient_id = cr.id)
    OR (e.provider_message_id IS NOT NULL AND e.provider_message_id = cr.provider_message_id)
  );

CREATE OR REPLACE FUNCTION public.fill_event_workspace_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid; _num uuid;
BEGIN
  IF NEW.workspace_id IS NOT NULL AND NEW.whatsapp_number_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.campaign_recipient_id IS NOT NULL THEN
    SELECT workspace_id, whatsapp_number_id INTO _ws, _num
      FROM public.campaign_recipients WHERE id = NEW.campaign_recipient_id;
  END IF;
  IF (_ws IS NULL OR _num IS NULL) AND NEW.provider_message_id IS NOT NULL THEN
    SELECT workspace_id, whatsapp_number_id INTO _ws, _num
      FROM public.campaign_recipients
      WHERE provider_message_id = NEW.provider_message_id
      LIMIT 1;
  END IF;
  NEW.workspace_id := COALESCE(NEW.workspace_id, _ws);
  NEW.whatsapp_number_id := COALESCE(NEW.whatsapp_number_id, _num);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fill_event_workspace_number ON public.whatsapp_message_events;
CREATE TRIGGER trg_fill_event_workspace_number
BEFORE INSERT ON public.whatsapp_message_events
FOR EACH ROW EXECUTE FUNCTION public.fill_event_workspace_number();

DROP VIEW IF EXISTS public.v_metrics_today CASCADE;
CREATE VIEW public.v_metrics_today
WITH (security_invoker = true)
AS
WITH t AS (SELECT public.dubai_start_of_day() AS d),
sent AS (
  SELECT cr.workspace_id, cr.whatsapp_number_id, cr.campaign_id,
         COUNT(*) FILTER (WHERE cr.status::text <> 'failed')::int  AS sent_today,
         COUNT(*) FILTER (WHERE cr.status::text  = 'failed')::int  AS failed_today
  FROM public.campaign_recipients cr, t
  WHERE cr.sent_at IS NOT NULL AND cr.sent_at >= t.d
  GROUP BY 1,2,3
),
delivered AS (
  SELECT e.workspace_id, e.whatsapp_number_id,
         COUNT(*)::int AS delivered_today
  FROM public.whatsapp_message_events e, t
  WHERE e.received_at >= t.d
    AND e.event_type = 'delivered'
  GROUP BY 1,2
),
replies AS (
  SELECT c.workspace_id, NULL::uuid AS whatsapp_number_id,
         COUNT(*)::int AS replies_today
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id, t
  WHERE m.created_at >= t.d AND m.direction::text = 'inbound'
  GROUP BY 1
)
SELECT
  COALESCE(s.workspace_id, d.workspace_id, r.workspace_id) AS workspace_id,
  COALESCE(s.whatsapp_number_id, d.whatsapp_number_id)     AS whatsapp_number_id,
  s.campaign_id                                            AS campaign_id,
  COALESCE(s.sent_today, 0)        AS sent_today,
  COALESCE(d.delivered_today, 0)   AS delivered_today,
  COALESCE(s.failed_today, 0)      AS failed_today,
  COALESCE(r.replies_today, 0)     AS replies_today
FROM sent s
FULL OUTER JOIN delivered d
  ON d.workspace_id = s.workspace_id AND d.whatsapp_number_id = s.whatsapp_number_id
FULL OUTER JOIN replies r
  ON r.workspace_id = COALESCE(s.workspace_id, d.workspace_id);

DROP VIEW IF EXISTS public.v_metrics_alltime CASCADE;
CREATE VIEW public.v_metrics_alltime
WITH (security_invoker = true)
AS
WITH sent AS (
  SELECT cr.workspace_id, cr.whatsapp_number_id, cr.campaign_id,
         COUNT(*) FILTER (WHERE cr.status::text <> 'failed')::int AS sent_alltime,
         COUNT(*) FILTER (WHERE cr.status::text  = 'failed')::int AS failed_alltime
  FROM public.campaign_recipients cr
  WHERE cr.sent_at IS NOT NULL
  GROUP BY 1,2,3
),
delivered AS (
  SELECT e.workspace_id, e.whatsapp_number_id,
         COUNT(*)::int AS delivered_alltime
  FROM public.whatsapp_message_events e
  WHERE e.event_type = 'delivered'
  GROUP BY 1,2
)
SELECT
  COALESCE(s.workspace_id, d.workspace_id) AS workspace_id,
  COALESCE(s.whatsapp_number_id, d.whatsapp_number_id) AS whatsapp_number_id,
  s.campaign_id,
  COALESCE(s.sent_alltime, 0)      AS sent_alltime,
  COALESCE(d.delivered_alltime, 0) AS delivered_alltime,
  COALESCE(s.failed_alltime, 0)    AS failed_alltime
FROM sent s
FULL OUTER JOIN delivered d
  ON d.workspace_id = s.workspace_id AND d.whatsapp_number_id = s.whatsapp_number_id;

CREATE OR REPLACE FUNCTION public.campaign_live_status(_campaign_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_pending int;
  v_last_sent timestamptz;
  v_recent boolean;
  v_today_start timestamptz := public.dubai_start_of_day();
  v_sched_start timestamptz;
BEGIN
  SELECT status::text, scheduled_start_at INTO v_status, v_sched_start
    FROM public.campaigns WHERE id = _campaign_id;
  IF v_status IS NULL THEN RETURN 'unknown'; END IF;

  IF v_status IN ('cancelled','failed','draft','paused') THEN RETURN v_status; END IF;

  SELECT
    COUNT(*) FILTER (WHERE status::text IN ('pending','scheduled','sending')),
    MAX(sent_at)
  INTO v_pending, v_last_sent
  FROM public.campaign_recipients WHERE campaign_id = _campaign_id;

  v_recent := v_last_sent IS NOT NULL AND v_last_sent > now() - interval '10 minutes';

  IF v_status = 'running' THEN
    IF v_recent THEN RETURN 'sending_now'; END IF;
    IF v_pending = 0 THEN
      IF v_last_sent IS NOT NULL AND v_last_sent >= v_today_start THEN RETURN 'completed_today'; END IF;
      RETURN 'completed_earlier';
    END IF;
    RETURN 'running';
  END IF;

  IF v_status = 'scheduled' THEN
    RETURN 'scheduled';
  END IF;

  IF v_status = 'completed' THEN
    IF v_last_sent IS NOT NULL AND v_last_sent >= v_today_start THEN RETURN 'completed_today'; END IF;
    RETURN 'completed_earlier';
  END IF;

  RETURN v_status;
END $$;

ALTER TABLE public.business_managers
  ADD COLUMN IF NOT EXISTS ads_launched_before boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_warmup_run_date date;

UPDATE public.business_managers bm
SET ads_launched_before = true
WHERE NOT bm.ads_launched_before AND EXISTS (
  SELECT 1
  FROM public.whatsapp_numbers n
  JOIN public.campaign_recipients cr ON cr.whatsapp_number_id = n.id
  WHERE n.business_manager_id = bm.id
    AND cr.sent_at IS NOT NULL
);