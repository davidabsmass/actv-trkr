-- Make qa_list_cron_jobs fast and resilient: only scan last 24h of run details,
-- bump local timeout, and gracefully degrade if the run-details scan still times out.
CREATE OR REPLACE FUNCTION public.qa_list_cron_jobs()
RETURNS TABLE(
  jobname text,
  schedule text,
  active boolean,
  last_run_started_at timestamp with time zone,
  last_run_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'cron', 'pg_catalog'
AS $function$
BEGIN
  -- Give ourselves more headroom than the default; this is a diagnostic helper.
  PERFORM set_config('statement_timeout', '20s', true);

  BEGIN
    RETURN QUERY
    WITH last_runs AS (
      SELECT DISTINCT ON (jrd.jobid)
        jrd.jobid,
        jrd.start_time,
        jrd.status
      FROM cron.job_run_details jrd
      WHERE jrd.start_time > now() - interval '24 hours'
      ORDER BY jrd.jobid, jrd.start_time DESC
    )
    SELECT
      j.jobname::text,
      j.schedule::text,
      j.active,
      lr.start_time AS last_run_started_at,
      lr.status::text AS last_run_status
    FROM cron.job j
    LEFT JOIN last_runs lr ON lr.jobid = j.jobid
    ORDER BY j.jobname;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: return jobs without last-run info if cron.job_run_details is too large/slow.
    RETURN QUERY
    SELECT
      j.jobname::text,
      j.schedule::text,
      j.active,
      NULL::timestamptz AS last_run_started_at,
      NULL::text AS last_run_status
    FROM cron.job j
    ORDER BY j.jobname;
  END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.qa_list_cron_jobs() TO service_role, authenticated;