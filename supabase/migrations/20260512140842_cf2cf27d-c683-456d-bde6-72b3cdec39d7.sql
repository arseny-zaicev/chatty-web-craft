
CREATE OR REPLACE FUNCTION public.fleet_number_summaries()
RETURNS TABLE (
  number_id uuid,
  templates_total bigint,
  templates_approved bigint,
  recipients_sent bigint,
  recipients_failed bigint,
  recipients_pending bigint,
  outbound_messages bigint,
  webhook_errors bigint,
  errors_since_unban bigint,
  last_campaign_at timestamptz,
  last_campaign_name text,
  active_campaigns jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH n AS (
    SELECT id, unrestricted_at FROM public.whatsapp_numbers
  ),
  tpl AS (
    SELECT whatsapp_number_id,
           COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE status = 'approved')::bigint AS approved
      FROM public.message_templates
     WHERE whatsapp_number_id IS NOT NULL
     GROUP BY whatsapp_number_id
  ),
  rec AS (
    SELECT whatsapp_number_id,
           COUNT(*) FILTER (WHERE status::text IN ('sent','delivered','read'))::bigint AS sent,
           COUNT(*) FILTER (WHERE status::text = 'failed')::bigint AS failed,
           COUNT(*) FILTER (WHERE status::text IN ('pending','scheduled','sending'))::bigint AS pending
      FROM public.campaign_recipients
     WHERE whatsapp_number_id IS NOT NULL
     GROUP BY whatsapp_number_id
  ),
  outb AS (
    SELECT c.whatsapp_number_id, COUNT(*)::bigint AS sent
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.direction = 'outbound'
       AND c.whatsapp_number_id IS NOT NULL
     GROUP BY c.whatsapp_number_id
  ),
  evt AS (
    SELECT e.whatsapp_number_id,
           COUNT(*) FILTER (WHERE e.event_type IN ('failed','error'))::bigint AS errors_total,
           COUNT(*) FILTER (
              WHERE e.event_type IN ('failed','error')
                AND e.received_at >= COALESCE(
                  (SELECT n.unrestricted_at FROM n WHERE n.id = e.whatsapp_number_id),
                  '1970-01-01'::timestamptz
                )
           )::bigint AS errors_since_unban
      FROM public.whatsapp_message_events e
     WHERE e.whatsapp_number_id IS NOT NULL
     GROUP BY e.whatsapp_number_id
  ),
  last_camp AS (
    SELECT DISTINCT ON (whatsapp_number_id)
           whatsapp_number_id,
           COALESCE(scheduled_start_at, created_at) AS at,
           name
      FROM public.campaigns
     WHERE whatsapp_number_id IS NOT NULL
     ORDER BY whatsapp_number_id, COALESCE(scheduled_start_at, created_at) DESC
  ),
  active AS (
    SELECT whatsapp_number_id,
           jsonb_agg(jsonb_build_object(
             'id', id,
             'name', name,
             'status', status,
             'workspace_id', workspace_id
           )) AS items
      FROM public.campaigns
     WHERE whatsapp_number_id IS NOT NULL
       AND status::text IN ('scheduled','running','paused')
     GROUP BY whatsapp_number_id
  )
  SELECT n.id,
         COALESCE(tpl.total, 0),
         COALESCE(tpl.approved, 0),
         COALESCE(rec.sent, 0),
         COALESCE(rec.failed, 0),
         COALESCE(rec.pending, 0),
         COALESCE(outb.sent, 0),
         COALESCE(evt.errors_total, 0),
         COALESCE(evt.errors_since_unban, 0),
         last_camp.at,
         last_camp.name,
         COALESCE(active.items, '[]'::jsonb)
    FROM n
    LEFT JOIN tpl       ON tpl.whatsapp_number_id = n.id
    LEFT JOIN rec       ON rec.whatsapp_number_id = n.id
    LEFT JOIN outb      ON outb.whatsapp_number_id = n.id
    LEFT JOIN evt       ON evt.whatsapp_number_id = n.id
    LEFT JOIN last_camp ON last_camp.whatsapp_number_id = n.id
    LEFT JOIN active    ON active.whatsapp_number_id = n.id;
$$;

REVOKE ALL ON FUNCTION public.fleet_number_summaries() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fleet_number_summaries() TO authenticated;
