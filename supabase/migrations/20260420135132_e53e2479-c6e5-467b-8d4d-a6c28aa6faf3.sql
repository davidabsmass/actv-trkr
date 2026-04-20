-- Release QA hardening helpers (admin-only, SECURITY DEFINER)
-- These provide real DB-side evidence for checks that previously could not
-- be verified from the edge runner.

-- 1) RLS status across all public tables
CREATE OR REPLACE FUNCTION public.qa_check_rls_status()
RETURNS TABLE(table_name text, rls_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.relname::text AS table_name, c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.qa_check_rls_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_check_rls_status() TO service_role;

-- 2) Verify has_role is SECURITY DEFINER (privilege escalation guard)
CREATE OR REPLACE FUNCTION public.qa_check_has_role_definer()
RETURNS TABLE(exists_flag boolean, is_security_definer boolean, prosrc_excerpt text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    TRUE AS exists_flag,
    p.prosecdef AS is_security_definer,
    LEFT(p.prosrc, 200) AS prosrc_excerpt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'has_role'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.qa_check_has_role_definer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_check_has_role_definer() TO service_role;

-- 3) List scheduled cron jobs + last run details
CREATE OR REPLACE FUNCTION public.qa_list_cron_jobs()
RETURNS TABLE(jobname text, schedule text, active boolean, last_run_started_at timestamptz, last_run_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $$
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    (SELECT d.start_time FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1) AS last_run_started_at,
    (SELECT d.status FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 1) AS last_run_status
  FROM cron.job j
  ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.qa_list_cron_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_list_cron_jobs() TO service_role;

-- 4) pgmq queue depth + oldest pending message age
CREATE OR REPLACE FUNCTION public.qa_check_pgmq_queue_depth()
RETURNS TABLE(queue_name text, queue_length bigint, oldest_msg_age_seconds numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pgmq, pg_catalog
AS $$
DECLARE
  q RECORD;
  v_len bigint;
  v_age numeric;
BEGIN
  FOR q IN SELECT queue_name FROM pgmq.list_queues() LOOP
    BEGIN
      SELECT count(*), COALESCE(EXTRACT(EPOCH FROM (now() - MIN(enqueued_at))), 0)
      INTO v_len, v_age
      FROM pgmq.metrics(q.queue_name);
      queue_name := q.queue_name;
      queue_length := v_len;
      oldest_msg_age_seconds := v_age;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- metrics() may not be available in all pgmq versions; fall back to count from queue table
      BEGIN
        EXECUTE format('SELECT count(*), COALESCE(EXTRACT(EPOCH FROM (now() - MIN(enqueued_at))), 0) FROM pgmq.q_%I', q.queue_name)
          INTO v_len, v_age;
        queue_name := q.queue_name;
        queue_length := v_len;
        oldest_msg_age_seconds := v_age;
        RETURN NEXT;
      EXCEPTION WHEN OTHERS THEN
        queue_name := q.queue_name;
        queue_length := -1;
        oldest_msg_age_seconds := -1;
        RETURN NEXT;
      END;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.qa_check_pgmq_queue_depth() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_check_pgmq_queue_depth() TO service_role;

-- Add ship_blocked flag to runs table (if not exists) for explicit stop-ship signal
ALTER TABLE public.release_qa_runs
  ADD COLUMN IF NOT EXISTS ship_blocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.release_qa_runs.ship_blocked IS
  'True when at least one critical-severity check failed. Differentiates blocking failures from non-blocking warnings.';