-- RPC used by campaign-overflow-rebalance to find scheduled_at pile-ups.
CREATE OR REPLACE FUNCTION public.campaign_overflow_clusters(_threshold integer DEFAULT 50)
RETURNS TABLE (campaign_id uuid, scheduled_at timestamptz, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT campaign_id, scheduled_at, COUNT(*)::bigint AS n
  FROM campaign_recipients
  WHERE status = 'scheduled'
  GROUP BY campaign_id, scheduled_at
  HAVING COUNT(*) >= _threshold
  ORDER BY n DESC
  LIMIT 50;
$$;

REVOKE EXECUTE ON FUNCTION public.campaign_overflow_clusters(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_overflow_clusters(integer) TO service_role;