
WITH agg AS (
  SELECT campaign_id,
         count(*) FILTER (WHERE status = 'sent')                             AS sent,
         count(*) FILTER (WHERE status = 'failed')                           AS failed,
         count(*) FILTER (WHERE status IN ('pending','scheduled','sending')) AS pending
  FROM public.campaign_recipients
  GROUP BY campaign_id
)
UPDATE public.campaigns c
SET sent_count   = COALESCE(a.sent, 0),
    failed_count = COALESCE(a.failed, 0),
    status       = CASE WHEN COALESCE(a.pending, 0) = 0 THEN 'completed'::campaign_status ELSE c.status END,
    updated_at   = now()
FROM agg a
WHERE a.campaign_id = c.id
  AND c.status = 'running';

CREATE OR REPLACE FUNCTION public.reap_finished_campaigns(p_idle_minutes integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT id FROM public.campaigns
    WHERE status = 'running'
      AND updated_at < now() - make_interval(mins => p_idle_minutes)
  ),
  agg AS (
    SELECT cr.campaign_id,
           count(*) FILTER (WHERE cr.status = 'sent')                             AS sent,
           count(*) FILTER (WHERE cr.status = 'failed')                           AS failed,
           count(*) FILTER (WHERE cr.status IN ('pending','scheduled','sending')) AS pending
    FROM public.campaign_recipients cr
    JOIN candidates c ON c.id = cr.campaign_id
    GROUP BY cr.campaign_id
  ),
  upd AS (
    UPDATE public.campaigns c
    SET sent_count   = COALESCE(a.sent, 0),
        failed_count = COALESCE(a.failed, 0),
        status       = CASE WHEN COALESCE(a.pending, 0) = 0 THEN 'completed'::campaign_status ELSE c.status END,
        updated_at   = now()
    FROM agg a
    WHERE a.campaign_id = c.id
      AND COALESCE(a.pending, 0) = 0
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_finished_campaigns(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_finished_campaigns(integer) TO service_role;
