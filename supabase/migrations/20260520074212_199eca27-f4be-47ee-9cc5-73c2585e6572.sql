DROP FUNCTION IF EXISTS public.release_job_lock(text);
DROP FUNCTION IF EXISTS public.try_job_lock(text);

CREATE TABLE IF NOT EXISTS public.job_locks (
  job_name text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  holder text
);

ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no client access to job_locks" ON public.job_locks;
CREATE POLICY "no client access to job_locks"
  ON public.job_locks FOR ALL
  USING (false) WITH CHECK (false);

CREATE FUNCTION public.try_job_lock(_job_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ttl interval := interval '5 minutes';
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
$$;

CREATE FUNCTION public.release_job_lock(_job_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.job_locks WHERE job_name = _job_name;
$$;

REVOKE ALL ON FUNCTION public.try_job_lock(text) FROM public;
REVOKE ALL ON FUNCTION public.release_job_lock(text) FROM public;
GRANT EXECUTE ON FUNCTION public.try_job_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_job_lock(text) TO service_role;