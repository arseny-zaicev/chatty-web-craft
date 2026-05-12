DO $$
BEGIN
  PERFORM cron.unschedule('templates-status-sync-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'templates-status-sync-hourly',
  '0 5-17 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/templates-status-sync',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);