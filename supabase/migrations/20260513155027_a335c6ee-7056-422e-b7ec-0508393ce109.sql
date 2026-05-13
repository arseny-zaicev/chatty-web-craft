DROP FUNCTION IF EXISTS public.campaign_live_counts(uuid[]);

CREATE OR REPLACE FUNCTION public.campaign_live_counts(p_campaign_ids uuid[])
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  sent bigint,
  failed bigint,
  pending bigint,
  replied bigint,
  tagged bigint,
  positive bigint,
  warm bigint,
  meeting bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT cr.campaign_id, cr.id AS recipient_id, cr.status::text AS status, cr.conversation_id
    FROM public.campaign_recipients cr
    WHERE cr.campaign_id = ANY(p_campaign_ids)
  ),
  joined AS (
    SELECT b.*, ci.reply_intent, ci.reply_sentiment,
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
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status IN ('sent','delivered','read')) AS sent,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status IN ('pending','scheduled','sending')) AS pending,
    COUNT(*) FILTER (WHERE has_inbound) AS replied,
    COUNT(*) FILTER (WHERE has_inbound AND reply_sentiment IS NOT NULL) AS tagged,
    COUNT(*) FILTER (WHERE reply_sentiment = 'positive') AS positive,
    COUNT(*) FILTER (
      WHERE reply_sentiment IN ('positive','objection')
         OR reply_intent IN ('meeting','pricing')
    ) AS warm,
    COUNT(*) FILTER (WHERE reply_intent = 'meeting') AS meeting
  FROM joined
  GROUP BY campaign_id;
$function$;