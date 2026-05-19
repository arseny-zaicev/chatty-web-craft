CREATE OR REPLACE VIEW public.v_metrics_today AS
WITH t AS (
  SELECT public.dubai_start_of_day() AS d
), sent AS (
  SELECT
    cr.workspace_id,
    COUNT(*) FILTER (WHERE cr.status::text <> 'failed')::integer AS sent_today,
    COUNT(*) FILTER (WHERE cr.status::text = 'failed')::integer AS failed_today
  FROM public.campaign_recipients cr, t
  WHERE cr.sent_at IS NOT NULL
    AND cr.sent_at >= t.d
  GROUP BY cr.workspace_id
), delivered AS (
  SELECT
    cr.workspace_id,
    COUNT(DISTINCT cr.id)::integer AS delivered_today
  FROM public.whatsapp_message_events e
  JOIN public.campaign_recipients cr ON cr.id = e.campaign_recipient_id
  CROSS JOIN t
  WHERE e.received_at >= t.d
    AND e.event_type IN ('delivered', 'read')
  GROUP BY cr.workspace_id
), replies AS (
  SELECT
    c.workspace_id,
    COUNT(*)::integer AS replies_today
  FROM public.conversations c, t
  WHERE c.first_human_reply_at IS NOT NULL
    AND c.first_human_reply_at >= t.d
  GROUP BY c.workspace_id
)
SELECT
  COALESCE(s.workspace_id, d.workspace_id, r.workspace_id) AS workspace_id,
  COALESCE(s.sent_today, 0) AS sent_today,
  COALESCE(d.delivered_today, 0) AS delivered_today,
  COALESCE(s.failed_today, 0) AS failed_today,
  COALESCE(r.replies_today, 0) AS replies_today
FROM sent s
FULL JOIN delivered d ON d.workspace_id = s.workspace_id
FULL JOIN replies r ON r.workspace_id = COALESCE(s.workspace_id, d.workspace_id);

CREATE OR REPLACE VIEW public.v_metrics_today_by_number AS
WITH t AS (
  SELECT public.dubai_start_of_day() AS d
), sent AS (
  SELECT
    cr.workspace_id,
    cr.whatsapp_number_id,
    COUNT(*) FILTER (WHERE cr.status::text <> 'failed')::integer AS sent_today,
    COUNT(*) FILTER (WHERE cr.status::text = 'failed')::integer AS failed_today
  FROM public.campaign_recipients cr, t
  WHERE cr.sent_at IS NOT NULL
    AND cr.sent_at >= t.d
  GROUP BY cr.workspace_id, cr.whatsapp_number_id
), delivered AS (
  SELECT
    cr.workspace_id,
    cr.whatsapp_number_id,
    COUNT(DISTINCT cr.id)::integer AS delivered_today
  FROM public.whatsapp_message_events e
  JOIN public.campaign_recipients cr ON cr.id = e.campaign_recipient_id
  CROSS JOIN t
  WHERE e.received_at >= t.d
    AND e.event_type IN ('delivered', 'read')
  GROUP BY cr.workspace_id, cr.whatsapp_number_id
)
SELECT
  COALESCE(s.workspace_id, d.workspace_id) AS workspace_id,
  COALESCE(s.whatsapp_number_id, d.whatsapp_number_id) AS whatsapp_number_id,
  COALESCE(s.sent_today, 0) AS sent_today,
  COALESCE(d.delivered_today, 0) AS delivered_today,
  COALESCE(s.failed_today, 0) AS failed_today
FROM sent s
FULL JOIN delivered d
  ON d.workspace_id = s.workspace_id
 AND d.whatsapp_number_id = s.whatsapp_number_id;

CREATE OR REPLACE VIEW public.v_metrics_alltime AS
WITH sent AS (
  SELECT
    cr.workspace_id,
    cr.whatsapp_number_id,
    cr.campaign_id,
    COUNT(*) FILTER (WHERE cr.status::text <> 'failed')::integer AS sent_alltime,
    COUNT(*) FILTER (WHERE cr.status::text = 'failed')::integer AS failed_alltime
  FROM public.campaign_recipients cr
  WHERE cr.sent_at IS NOT NULL
  GROUP BY cr.workspace_id, cr.whatsapp_number_id, cr.campaign_id
), delivered AS (
  SELECT
    cr.workspace_id,
    cr.whatsapp_number_id,
    COUNT(DISTINCT cr.id)::integer AS delivered_alltime
  FROM public.whatsapp_message_events e
  JOIN public.campaign_recipients cr ON cr.id = e.campaign_recipient_id
  WHERE e.event_type IN ('delivered', 'read')
  GROUP BY cr.workspace_id, cr.whatsapp_number_id
)
SELECT
  COALESCE(s.workspace_id, d.workspace_id) AS workspace_id,
  COALESCE(s.whatsapp_number_id, d.whatsapp_number_id) AS whatsapp_number_id,
  s.campaign_id,
  COALESCE(s.sent_alltime, 0) AS sent_alltime,
  COALESCE(d.delivered_alltime, 0) AS delivered_alltime,
  COALESCE(s.failed_alltime, 0) AS failed_alltime
FROM sent s
FULL JOIN delivered d
  ON d.workspace_id = s.workspace_id
 AND d.whatsapp_number_id = s.whatsapp_number_id;

CREATE OR REPLACE FUNCTION public.number_live_stats(p_number_ids uuid[])
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
    SELECT public.dubai_start_of_day() AS d
  ), recipient_agg AS (
    SELECT
      cr.whatsapp_number_id AS nid,
      COUNT(*) FILTER (
        WHERE cr.status::text <> 'failed'
          AND cr.sent_at IS NOT NULL
          AND cr.sent_at >= (SELECT d FROM today)
      )::bigint AS sent_today,
      COUNT(*) FILTER (
        WHERE cr.status::text <> 'failed'
          AND cr.sent_at IS NOT NULL
          AND cr.sent_at >= now() - interval '7 days'
      )::bigint AS sent_7d,
      COUNT(*) FILTER (
        WHERE cr.status::text <> 'failed'
          AND cr.sent_at IS NOT NULL
      )::bigint AS sent_all,
      COUNT(*) FILTER (
        WHERE cr.status::text = 'failed'
          AND cr.updated_at IS NOT NULL
          AND cr.updated_at >= (SELECT d FROM today)
      )::bigint AS failed_today,
      COUNT(*) FILTER (
        WHERE cr.status::text = 'failed'
          AND cr.updated_at >= now() - interval '7 days'
      )::bigint AS failed_7d,
      COUNT(*) FILTER (
        WHERE cr.status::text IN ('pending','scheduled','sending')
      )::bigint AS pending_now,
      MAX(cr.sent_at) FILTER (WHERE cr.status::text <> 'failed') AS last_sent_at,
      MAX(cr.updated_at) FILTER (WHERE cr.status::text = 'failed') AS last_failed_at
    FROM public.campaign_recipients cr
    WHERE cr.whatsapp_number_id = ANY(p_number_ids)
    GROUP BY cr.whatsapp_number_id
  ), delivered_agg AS (
    SELECT
      cr.whatsapp_number_id AS nid,
      COUNT(DISTINCT cr.id) FILTER (
        WHERE e.received_at >= (SELECT d FROM today)
      )::bigint AS delivered_today,
      COUNT(DISTINCT cr.id) FILTER (
        WHERE e.received_at >= now() - interval '7 days'
      )::bigint AS delivered_7d,
      COUNT(DISTINCT cr.id)::bigint AS delivered_all
    FROM public.whatsapp_message_events e
    JOIN public.campaign_recipients cr ON cr.id = e.campaign_recipient_id
    WHERE cr.whatsapp_number_id = ANY(p_number_ids)
      AND e.event_type IN ('delivered', 'read')
    GROUP BY cr.whatsapp_number_id
  )
  SELECT
    n.id,
    COALESCE(r.sent_today, 0),
    COALESCE(r.sent_7d, 0),
    COALESCE(r.sent_all, 0),
    COALESCE(d.delivered_today, 0),
    COALESCE(d.delivered_7d, 0),
    COALESCE(d.delivered_all, 0),
    COALESCE(r.failed_today, 0),
    COALESCE(r.failed_7d, 0),
    COALESCE(r.pending_now, 0),
    r.last_sent_at,
    r.last_failed_at,
    n.daily_send_limit,
    n.restricted_at,
    n.status::text
  FROM public.whatsapp_numbers n
  LEFT JOIN recipient_agg r ON r.nid = n.id
  LEFT JOIN delivered_agg d ON d.nid = n.id
  WHERE n.id = ANY(p_number_ids)
    AND public.is_workspace_member(n.workspace_id, auth.uid());
$function$;