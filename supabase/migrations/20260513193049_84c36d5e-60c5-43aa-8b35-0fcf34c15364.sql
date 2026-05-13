
-- Acquire a session-scoped advisory lock keyed by job name.
-- Returns true if acquired, false if another invocation is already holding it.
CREATE OR REPLACE FUNCTION public.try_job_lock(_job_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(hashtextextended('lovable_job:' || _job_name, 0));
$$;

CREATE OR REPLACE FUNCTION public.release_job_lock(_job_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(hashtextextended('lovable_job:' || _job_name, 0));
$$;

REVOKE EXECUTE ON FUNCTION public.try_job_lock(text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_job_lock(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.try_job_lock(text)     TO service_role;
GRANT  EXECUTE ON FUNCTION public.release_job_lock(text) TO service_role;
