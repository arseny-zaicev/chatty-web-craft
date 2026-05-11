CREATE OR REPLACE VIEW public.whatsapp_number_usage_summary AS
WITH active AS (
  SELECT whatsapp_number_id,
         count(*) FILTER (WHERE status IN ('scheduled','running','paused')) AS active_campaign_count,
         max(updated_at) FILTER (WHERE status IN ('scheduled','running','paused')) AS last_active_update_at
  FROM public.campaigns
  WHERE whatsapp_number_id IS NOT NULL
  GROUP BY whatsapp_number_id
),
last_recip AS (
  SELECT DISTINCT ON (cr.whatsapp_number_id)
         cr.whatsapp_number_id,
         cr.sent_at AS last_used_at,
         cr.workspace_id AS last_workspace_id,
         cr.campaign_id AS last_campaign_id
  FROM public.campaign_recipients cr
  WHERE cr.whatsapp_number_id IS NOT NULL AND cr.sent_at IS NOT NULL
  ORDER BY cr.whatsapp_number_id, cr.sent_at DESC
)
SELECT n.id AS number_id,
       COALESCE(a.active_campaign_count, 0) AS active_campaign_count,
       lr.last_used_at,
       lr.last_workspace_id,
       lr.last_campaign_id
FROM public.whatsapp_numbers n
LEFT JOIN active a ON a.whatsapp_number_id = n.id
LEFT JOIN last_recip lr ON lr.whatsapp_number_id = n.id;

GRANT SELECT ON public.whatsapp_number_usage_summary TO authenticated;