DO $$
BEGIN
  PERFORM cron.unschedule('google-sheets-sync-every-2min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'google-sheets-sync-every-2min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/google-sheets-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA'
    ),
    body := jsonb_build_object(
      'source_connection_id', id,
      'secret_token', secret_token
    )
  )
  FROM public.source_connections
  WHERE kind = 'google_sheet'
    AND status = 'active';
  $$
);