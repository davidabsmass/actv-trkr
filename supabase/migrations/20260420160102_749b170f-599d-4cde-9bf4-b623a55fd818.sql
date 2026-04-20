DROP FUNCTION IF EXISTS public.qa_list_cron_jobs();

CREATE OR REPLACE FUNCTION public.qa_list_cron_jobs()
RETURNS TABLE(jobname text, schedule text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'pg_catalog'
AS $$
  SELECT j.jobname::text, j.schedule::text, j.active
  FROM cron.job j
  ORDER BY j.jobname;
$$;

CREATE OR REPLACE FUNCTION public.qa_get_cron_last_runs(jobname_patterns text[])
RETURNS TABLE(jobname text, last_run_started_at timestamptz, last_run_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'pg_catalog'
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '8s', true);

  RETURN QUERY
  WITH matched_jobs AS (
    SELECT j.jobid, j.jobname
    FROM cron.job j
    WHERE EXISTS (
      SELECT 1 FROM unnest(jobname_patterns) p
      WHERE j.jobname ~* p
    )
  ),
  last_runs AS (
    SELECT DISTINCT ON (jrd.jobid)
      jrd.jobid, jrd.start_time, jrd.status
    FROM cron.job_run_details jrd
    WHERE jrd.jobid IN (SELECT jobid FROM matched_jobs)
      AND jrd.start_time > now() - interval '6 hours'
    ORDER BY jrd.jobid, jrd.start_time DESC
  )
  SELECT
    mj.jobname::text,
    lr.start_time AS last_run_started_at,
    lr.status::text AS last_run_status
  FROM matched_jobs mj
  LEFT JOIN last_runs lr ON lr.jobid = mj.jobid;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY
  SELECT j.jobname::text, NULL::timestamptz, NULL::text
  FROM cron.job j
  WHERE EXISTS (
    SELECT 1 FROM unnest(jobname_patterns) p WHERE j.jobname ~* p
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.qa_list_cron_jobs() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_get_cron_last_runs(text[]) TO service_role, authenticated;