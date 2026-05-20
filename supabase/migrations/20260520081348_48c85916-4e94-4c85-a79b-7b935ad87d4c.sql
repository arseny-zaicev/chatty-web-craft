DELETE FROM public.job_locks WHERE job_name = 'campaigns-process';

CREATE OR REPLACE FUNCTION public.try_job_lock(_job_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ttl interval := interval '90 seconds';
  _now timestamptz := now();
  _n int;
BEGIN
  INSERT INTO public.job_locks(job_name, acquired_at)
  VALUES (_job_name, _now)
  ON CONFLICT (job_name) DO NOTHING;

  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 1 THEN RETURN true; END IF;

  UPDATE public.job_locks
     SET acquired_at = _now
   WHERE job_name = _job_name
     AND acquired_at < _now - _ttl;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n = 1;
END;
$function$;

DROP FUNCTION IF EXISTS public.debug_cron_status();