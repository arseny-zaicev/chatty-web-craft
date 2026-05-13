-- 1. Backfill missed lead.first_reply events (last 24h).
INSERT INTO public.slack_event_queue (event_type, workspace_id, payload)
SELECT
  'lead.first_reply',
  cr.workspace_id,
  jsonb_build_object(
    'campaign_recipient_id', cr.id,
    'campaign_id',           cr.campaign_id,
    'pipeline_id',           c.pipeline_id,
    'pipeline_name',         p.name,
    'conversation_id',       cr.conversation_id,
    'contact_phone',         cr.contact_phone,
    'contact_name',          COALESCE(cr.contact_name, c.contact_name),
    'last_message_text',     c.last_message_text,
    'slack_channel_id',      p.slack_channel_id,
    'whatsapp_number_id',    cr.whatsapp_number_id,
    'source',                'backfill_missed_first_reply'
  )
FROM public.campaign_recipients cr
JOIN public.conversations c ON c.id = cr.conversation_id
LEFT JOIN public.pipelines p ON p.id = c.pipeline_id
WHERE cr.status = 'replied'
  AND cr.conversation_id IS NOT NULL
  AND cr.updated_at > now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM public.slack_event_queue q
    WHERE q.event_type IN ('lead.first_reply','positive_lead')
      AND q.payload->>'conversation_id' = cr.conversation_id::text
  );

-- 2. Schedule hourly watchdog: detects replies > 30 min old with no Slack
--    event of either type, posts a digest into the Iskra delivery channel.
SELECT cron.schedule(
  'reply-notification-watchdog-hourly',
  '15 * * * *',
  $$ SELECT net.http_post(
    url := 'https://xglfamaaotmwulglwcui.supabase.co/functions/v1/reply-notification-watchdog',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnbGZhbWFhb3Rtd3VsZ2x3Y3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTIxOTEsImV4cCI6MjA4MjcyODE5MX0.Fdo6cQUAMoUlC0d64N84O42-zi1ZG85ijBKCXqtnSRA"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) $$
);