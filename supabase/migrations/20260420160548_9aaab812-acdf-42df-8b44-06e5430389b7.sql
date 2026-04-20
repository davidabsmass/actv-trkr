CREATE OR REPLACE FUNCTION public.qa_get_cron_last_runs(jobname_patterns text[])
RETURNS TABLE(jobname text, last_run_started_at timestamptz, last_run_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'pg_catalog'
AS $$
  SELECT j.jobname::text,
         NULL::timestamptz AS last_run_started_at,
         CASE WHEN j.active THEN 'scheduled' ELSE 'inactive' END AS last_run_status
  FROM cron.job j
  WHERE EXISTS (
    SELECT 1 FROM unnest(jobname_patterns) p WHERE j.jobname ~* p
  );
$$;