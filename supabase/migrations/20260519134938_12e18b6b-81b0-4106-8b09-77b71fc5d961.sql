CREATE OR REPLACE FUNCTION public.reap_stuck_sending_recipients(
  p_idle_minutes integer DEFAULT 10,
  p_dispatch_modes text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected int;
BEGIN
  WITH bumped AS (
    UPDATE public.campaign_recipients cr
       SET status = 'scheduled',
           updated_at = now()
      FROM public.campaigns c
     WHERE cr.campaign_id = c.id
       AND cr.status = 'sending'
       AND cr.updated_at < now() - make_interval(mins => GREATEST(p_idle_minutes, 1))
       AND (p_dispatch_modes IS NULL OR c.dispatch_mode = ANY(p_dispatch_modes))
    RETURNING cr.id
  )
  SELECT COUNT(*) INTO affected FROM bumped;
  RETURN affected;
END
$function$;