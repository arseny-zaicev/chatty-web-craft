
-- Throttle table: one row tracks last dispatcher kick
CREATE TABLE IF NOT EXISTS public.slack_dispatch_kick (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_kicked_at timestamptz NOT NULL DEFAULT '1970-01-01'::timestamptz
);
INSERT INTO public.slack_dispatch_kick (id, last_kicked_at)
VALUES (true, '1970-01-01'::timestamptz)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.slack_dispatch_kick ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no direct access" ON public.slack_dispatch_kick;
CREATE POLICY "no direct access" ON public.slack_dispatch_kick FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.kick_slack_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_last timestamptz;
  v_source text;
BEGIN
  -- Skip backfill/digest sources - handled by cron coalescer
  v_source := COALESCE(NEW.payload->>'source', '');
  IF v_source IN ('backfill_missed_first_reply','watchdog_backfill','de_tokens_backfill') THEN
    RETURN NEW;
  END IF;

  -- Only kick for real-time event types
  IF NEW.event_type NOT IN ('lead.first_reply','positive_lead','inbox_unread_spike','number_restricted','number_blocked','number_recovered','number_quality_changed') THEN
    RETURN NEW;
  END IF;

  -- Throttle: at most one kick every 10 seconds
  UPDATE public.slack_dispatch_kick
     SET last_kicked_at = now()
   WHERE last_kicked_at < now() - interval '10 seconds'
   RETURNING last_kicked_at INTO v_last;

  IF v_last IS NULL THEN
    RETURN NEW; -- throttled
  END IF;

  PERFORM net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/slack-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := '{"source":"trigger"}'::jsonb,
    timeout_milliseconds := 60000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if pg_net hiccups
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kick_slack_dispatch ON public.slack_event_queue;
CREATE TRIGGER trg_kick_slack_dispatch
AFTER INSERT ON public.slack_event_queue
FOR EACH ROW
EXECUTE FUNCTION public.kick_slack_dispatch();
