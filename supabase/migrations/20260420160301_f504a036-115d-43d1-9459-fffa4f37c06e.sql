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
  -- Single small scan: only the last 2 hours, grouped by jobid
  recent_runs AS (
    SELECT jobid, max(start_time) AS last_start
    FROM cron.job_run_details
    WHERE start_time > now() - interval '2 hours'
    GROUP BY jobid
  ),
  with_status AS (
    SELECT
      mj.jobname,
      rr.last_start,
      (SELECT jrd.status FROM cron.job_run_details jrd
        WHERE jrd.jobid = mj.jobid AND jrd.start_time = rr.last_start
        LIMIT 1) AS last_status
    FROM matched_jobs mj
    LEFT JOIN recent_runs rr ON rr.jobid = mj.jobid
  )
  SELECT
    ws.jobname::text,
    ws.last_start AS last_run_started_at,
    ws.last_status::text AS last_run_status
  FROM with_status ws;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY
  SELECT j.jobname::text, NULL::timestamptz, NULL::text
  FROM cron.job j
  WHERE EXISTS (
    SELECT 1 FROM unnest(jobname_patterns) p WHERE j.jobname ~* p
  );
END;
$$;