CREATE OR REPLACE FUNCTION public.debug_cron_status()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_run timestamptz, last_status text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, cron AS $$
  SELECT j.jobid, j.jobname, j.schedule, j.active,
    (SELECT max(d.start_time) FROM cron.job_run_details d WHERE d.jobid = j.jobid),
    (SELECT d.status FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1)
  FROM cron.job j ORDER BY j.jobid;
$$;
REVOKE ALL ON FUNCTION public.debug_cron_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_cron_status() TO authenticated, service_role, anon;