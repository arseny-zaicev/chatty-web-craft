
-- 1) System alerts debounce table
CREATE TABLE IF NOT EXISTS public.system_alerts (
  kind TEXT PRIMARY KEY,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alerts" ON public.system_alerts FOR SELECT USING (public.is_admin(auth.uid()));

-- 2) Reschedule cron jobs with explicit 60s timeout to avoid silent 5s failures
SELECT cron.unschedule('process-campaigns-every-minute');
SELECT cron.unschedule('slack-dispatch-minute');
SELECT cron.unschedule('lead-dispatch-every-minute');
SELECT cron.unschedule('google-sheets-sync-every-2min');

SELECT cron.schedule(
  'process-campaigns-every-minute', '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/campaigns',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := '{"action":"process"}'::jsonb,
    timeout_milliseconds := 60000
  ) $$
);

SELECT cron.schedule(
  'slack-dispatch-minute', '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/slack-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) $$
);

SELECT cron.schedule(
  'lead-dispatch-every-minute', '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/lead-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := jsonb_build_object('tick', now()),
    timeout_milliseconds := 60000
  ) $$
);

SELECT cron.schedule(
  'google-sheets-sync-every-2min', '*/2 * * * *',
  $$ SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/google-sheets-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA'
    ),
    body := jsonb_build_object('source_connection_id', id, 'secret_token', secret_token),
    timeout_milliseconds := 60000
  )
  FROM public.source_connections
  WHERE kind='google_sheet' AND status='active' $$
);

-- 3) Watchdog cron — checks for stalls every 5 min
SELECT cron.schedule(
  'health-watchdog-every-5min', '*/5 * * * *',
  $$ SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/health-watchdog',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) $$
);
