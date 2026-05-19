DROP FUNCTION IF EXISTS public.number_live_stats(uuid[]);

CREATE FUNCTION public.number_live_stats(p_number_ids uuid[])
RETURNS TABLE(
  whatsapp_number_id uuid,
  sent_today bigint,
  sent_7d bigint,
  sent_all bigint,
  delivered_today bigint,
  delivered_7d bigint,
  delivered_all bigint,
  failed_today bigint,
  failed_7d bigint,
  pending_now bigint,
  last_sent_at timestamp with time zone,
  last_failed_at timestamp with time zone,
  daily_send_limit integer,
  restricted_at timestamp with time zone,
  status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Dubai')::date AS d
  ),
  agg AS (
    SELECT
      cr.whatsapp_number_id AS nid,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('sent','delivered','read')
          AND cr.sent_at IS NOT NULL
          AND (cr.sent_at AT TIME ZONE 'Asia/Dubai')::date = (SELECT d FROM today)
      )::bigint AS sent_today,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('sent','delivered','read')
          AND cr.sent_at IS NOT NULL
          AND cr.sent_at >= now() - interval '7 days'
      )::bigint AS sent_7d,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('sent','delivered','read')
      )::bigint AS sent_all,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('delivered','read')
          AND cr.sent_at IS NOT NULL
          AND (cr.sent_at AT TIME ZONE 'Asia/Dubai')::date = (SELECT d FROM today)
      )::bigint AS delivered_today,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('delivered','read')
          AND cr.sent_at IS NOT NULL
          AND cr.sent_at >= now() - interval '7 days'
      )::bigint AS delivered_7d,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('delivered','read')
      )::bigint AS delivered_all,
      COUNT(*) FILTER (
        WHERE cr.status::text = 'failed'
          AND cr.updated_at IS NOT NULL
          AND (cr.updated_at AT TIME ZONE 'Asia/Dubai')::date = (SELECT d FROM today)
      )::bigint AS failed_today,
      COUNT(*) FILTER (
        WHERE cr.status::text = 'failed'
          AND cr.updated_at >= now() - interval '7 days'
      )::bigint AS failed_7d,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('pending','scheduled','sending')
      )::bigint AS pending_now,
      MAX(cr.sent_at) FILTER (WHERE cr.status::text IN ('sent','delivered','read')) AS last_sent_at,
      MAX(cr.updated_at) FILTER (WHERE cr.status::text = 'failed') AS last_failed_at
    FROM public.campaign_recipients cr
    WHERE cr.whatsapp_number_id = ANY(p_number_ids)
    GROUP BY cr.whatsapp_number_id
  )
  SELECT
    n.id,
    COALESCE(a.sent_today, 0),
    COALESCE(a.sent_7d, 0),
    COALESCE(a.sent_all, 0),
    COALESCE(a.delivered_today, 0),
    COALESCE(a.delivered_7d, 0),
    COALESCE(a.delivered_all, 0),
    COALESCE(a.failed_today, 0),
    COALESCE(a.failed_7d, 0),
    COALESCE(a.pending_now, 0),
    a.last_sent_at,
    a.last_failed_at,
    n.daily_send_limit,
    n.restricted_at,
    n.status::text
  FROM public.whatsapp_numbers n
  LEFT JOIN agg a ON a.nid = n.id
  WHERE n.id = ANY(p_number_ids)
    AND public.is_workspace_member(n.workspace_id, auth.uid());
$function$;