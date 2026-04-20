-- Fix qa_check_pgmq_queue_depth: rename OUT param to avoid ambiguous column reference
-- with pgmq.metrics(queue_name) which also returns a queue_name column.
DROP FUNCTION IF EXISTS public.qa_check_pgmq_queue_depth();

CREATE OR REPLACE FUNCTION public.qa_check_pgmq_queue_depth()
 RETURNS TABLE(qname text, queue_length bigint, oldest_msg_age_seconds numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pgmq', 'pg_catalog'
AS $function$
DECLARE
  q RECORD;
  v_len bigint;
  v_age numeric;
BEGIN
  FOR q IN SELECT pgmq.list_queues() AS r LOOP
    BEGIN
      -- pgmq.metrics returns (queue_name, queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages, scrape_time)
      EXECUTE 'SELECT m.queue_length, COALESCE(m.oldest_msg_age_sec, 0)::numeric FROM pgmq.metrics($1) m'
        INTO v_len, v_age
        USING (q.r).queue_name;
      qname := (q.r).queue_name;
      queue_length := COALESCE(v_len, 0);
      oldest_msg_age_seconds := COALESCE(v_age, 0);
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: count rows in the underlying pgmq.q_<name> table
      BEGIN
        EXECUTE format(
          'SELECT count(*)::bigint, COALESCE(EXTRACT(EPOCH FROM (now() - MIN(enqueued_at))), 0)::numeric FROM pgmq.q_%I',
          (q.r).queue_name
        ) INTO v_len, v_age;
        qname := (q.r).queue_name;
        queue_length := COALESCE(v_len, 0);
        oldest_msg_age_seconds := COALESCE(v_age, 0);
        RETURN NEXT;
      EXCEPTION WHEN OTHERS THEN
        qname := (q.r).queue_name;
        queue_length := -1;
        oldest_msg_age_seconds := -1;
        RETURN NEXT;
      END;
    END;
  END LOOP;
END;
$function$;

-- Fix qa_list_cron_jobs: replace per-row correlated subqueries (slow → timeouts)
-- with a single DISTINCT ON join on cron.job_run_details.
CREATE OR REPLACE FUNCTION public.qa_list_cron_jobs()
 RETURNS TABLE(jobname text, schedule text, active boolean, last_run_started_at timestamp with time zone, last_run_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_catalog'
AS $function$
  WITH last_runs AS (
    SELECT DISTINCT ON (jobid)
      jobid, start_time, status
    FROM cron.job_run_details
    WHERE start_time > now() - interval '7 days'
    ORDER BY jobid, start_time DESC
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
$function$;