
-- Aggregate recipient status counts for many campaigns in one round-trip.
CREATE OR REPLACE FUNCTION public.campaign_recipient_counts(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  sent_count bigint,
  failed_count bigint,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.campaign_id,
    COUNT(*) FILTER (WHERE cr.status = 'sent')                                       AS sent_count,
    COUNT(*) FILTER (WHERE cr.status = 'failed')                                     AS failed_count,
    COUNT(*) FILTER (WHERE cr.status IN ('pending','scheduled','sending'))           AS pending_count
  FROM public.campaign_recipients cr
  WHERE cr.campaign_id = ANY(p_campaign_ids)
  GROUP BY cr.campaign_id;
$$;

REVOKE ALL ON FUNCTION public.campaign_recipient_counts(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_recipient_counts(uuid[]) TO service_role;

-- Recover recipients stuck in 'sending' state (function timed out mid-send,
-- Gupshup hung, etc). After 10 minutes we presume the previous attempt is dead
-- and reset to 'scheduled' so the next tick can retry. Returns affected count.
CREATE OR REPLACE FUNCTION public.reap_stuck_sending_recipients(p_idle_minutes int DEFAULT 10)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  WITH bumped AS (
    UPDATE public.campaign_recipients
       SET status = 'scheduled',
           updated_at = now()
     WHERE status = 'sending'
       AND updated_at < now() - make_interval(mins => GREATEST(p_idle_minutes, 1))
    RETURNING id
  )
  SELECT COUNT(*) INTO affected FROM bumped;
  RETURN affected;
END
$$;

REVOKE ALL ON FUNCTION public.reap_stuck_sending_recipients(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stuck_sending_recipients(int) TO service_role;
