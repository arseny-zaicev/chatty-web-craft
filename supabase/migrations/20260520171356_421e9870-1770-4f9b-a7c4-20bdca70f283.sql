CREATE OR REPLACE FUNCTION public.campaign_metrics_for_range(
  p_campaign_ids uuid[],
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(campaign_id uuid, sent int, delivered int, failed int, replied int)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT
      cr.campaign_id,
      ev.provider_message_id,
      MAX(CASE ev.event_type
        WHEN 'read'      THEN 4
        WHEN 'delivered' THEN 3
        WHEN 'sent'      THEN 2
        WHEN 'failed'    THEN 1
        ELSE 0 END) AS rank
    FROM public.whatsapp_message_events ev
    JOIN public.campaign_recipients cr ON cr.id = ev.campaign_recipient_id
    WHERE cr.campaign_id = ANY(p_campaign_ids)
      AND ev.received_at >= _from
      AND ev.received_at <  _to
      AND ev.provider_message_id IS NOT NULL
    GROUP BY cr.campaign_id, ev.provider_message_id
  ),
  agg AS (
    SELECT campaign_id,
      COUNT(*) FILTER (WHERE rank >= 2)::int AS sent,
      COUNT(*) FILTER (WHERE rank >= 3)::int AS delivered,
      COUNT(*) FILTER (WHERE rank = 1)::int AS failed
    FROM e GROUP BY campaign_id
  ),
  r AS (
    SELECT cr.campaign_id, COUNT(DISTINCT cr.conversation_id)::int AS replied
    FROM public.campaign_recipients cr
    JOIN public.messages m ON m.conversation_id = cr.conversation_id
    WHERE cr.campaign_id = ANY(p_campaign_ids)
      AND m.direction = 'inbound'
      AND m.created_at >= _from
      AND m.created_at <  _to
    GROUP BY cr.campaign_id
  )
  SELECT
    COALESCE(agg.campaign_id, r.campaign_id) AS campaign_id,
    COALESCE(agg.sent, 0) AS sent,
    COALESCE(agg.delivered, 0) AS delivered,
    COALESCE(agg.failed, 0) AS failed,
    COALESCE(r.replied, 0) AS replied
  FROM agg
  FULL JOIN r ON r.campaign_id = agg.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_metrics_for_range(uuid[], timestamptz, timestamptz) TO authenticated, service_role;