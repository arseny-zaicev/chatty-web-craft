CREATE OR REPLACE VIEW public.v_metrics_today_by_campaign AS
WITH t AS (
  SELECT public.dubai_start_of_day() AS d
), sent AS (
  SELECT
    cr.workspace_id,
    cr.campaign_id,
    COUNT(*) FILTER (WHERE cr.status::text <> 'failed')::integer AS sent_today,
    COUNT(*) FILTER (WHERE cr.status::text = 'failed')::integer AS failed_today
  FROM public.campaign_recipients cr, t
  WHERE cr.sent_at IS NOT NULL
    AND cr.sent_at >= t.d
  GROUP BY cr.workspace_id, cr.campaign_id
), delivered AS (
  SELECT
    cr.workspace_id,
    cr.campaign_id,
    COUNT(DISTINCT cr.id)::integer AS delivered_today
  FROM public.whatsapp_message_events e
  JOIN public.campaign_recipients cr ON cr.id = e.campaign_recipient_id
  CROSS JOIN t
  WHERE e.received_at >= t.d
    AND e.event_type IN ('delivered', 'read')
  GROUP BY cr.workspace_id, cr.campaign_id
)
SELECT
  COALESCE(s.workspace_id, d.workspace_id) AS workspace_id,
  COALESCE(s.campaign_id, d.campaign_id) AS campaign_id,
  COALESCE(s.sent_today, 0) AS sent_today,
  COALESCE(s.failed_today, 0) AS failed_today,
  COALESCE(d.delivered_today, 0) AS delivered_today
FROM sent s
FULL JOIN delivered d
  ON d.workspace_id = s.workspace_id
 AND d.campaign_id = s.campaign_id;