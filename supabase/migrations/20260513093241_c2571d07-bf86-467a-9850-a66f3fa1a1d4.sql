-- Live per-campaign counts sourced from real recipient + classification data,
-- not from the cached campaign_insights snapshot. Used by the campaigns list
-- and the report panel so numbers never go stale.
CREATE OR REPLACE FUNCTION public.campaign_live_counts(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  total bigint,
  sent bigint,
  failed bigint,
  pending bigint,
  replied bigint,
  positive bigint,
  meeting bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT
      cr.campaign_id,
      cr.id AS recipient_id,
      cr.status::text AS status,
      cr.conversation_id
    FROM public.campaign_recipients cr
    WHERE cr.campaign_id = ANY(p_campaign_ids)
  ),
  joined AS (
    SELECT
      b.*,
      ci.reply_intent,
      ci.reply_sentiment,
      EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.conversation_id = b.conversation_id
          AND m.direction::text = 'inbound'
        LIMIT 1
      ) AS has_inbound
    FROM base b
    LEFT JOIN public.conversation_insights ci ON ci.conversation_id = b.conversation_id
  )
  SELECT
    campaign_id,
    COUNT(*)                                                                      AS total,
    COUNT(*) FILTER (WHERE status IN ('sent','delivered','read'))                 AS sent,
    COUNT(*) FILTER (WHERE status = 'failed')                                     AS failed,
    COUNT(*) FILTER (WHERE status IN ('pending','scheduled','sending'))           AS pending,
    COUNT(*) FILTER (WHERE has_inbound)                                           AS replied,
    COUNT(*) FILTER (WHERE reply_sentiment = 'positive' OR reply_intent = 'positive') AS positive,
    COUNT(*) FILTER (WHERE reply_intent = 'meeting')                              AS meeting
  FROM joined
  GROUP BY campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_live_counts(uuid[]) TO authenticated;