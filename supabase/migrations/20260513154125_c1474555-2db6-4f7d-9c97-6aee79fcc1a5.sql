-- Release stale reservations (>30 min) on demand
CREATE OR REPLACE FUNCTION public.release_stale_reservations(_older_than_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  WITH released AS (
    UPDATE public.audience_rows
    SET usage_status = 'unused', reserved_at = NULL
    WHERE usage_status = 'reserved'
      AND used_in_campaign_id IS NULL
      AND reserved_at IS NOT NULL
      AND reserved_at < now() - (_older_than_minutes || ' minutes')::interval
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM released;
  RETURN _count;
END $$;

-- One-shot cleanup of currently stuck reservations (older than 1h, no campaign)
UPDATE public.audience_rows
SET usage_status = 'unused', reserved_at = NULL
WHERE usage_status = 'reserved'
  AND used_in_campaign_id IS NULL
  AND (reserved_at IS NULL OR reserved_at < now() - interval '1 hour');