-- Track which grants have already had their summary email sent so we never double-send.
ALTER TABLE public.dashboard_access_grants
  ADD COLUMN IF NOT EXISTS summary_email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dashboard_access_grants_pending_summary
  ON public.dashboard_access_grants (expires_at)
  WHERE summary_email_sent_at IS NULL;

-- Schedule a job that asks the dispatcher edge function to find recently-ended
-- grants (revoked OR expired in the last 24h) and email a summary to the
-- customer who granted access. Runs every 5 minutes.
DO $$
DECLARE
  fn_url text;
  service_key text;
BEGIN
  -- Build the function URL from the project ref.
  fn_url := 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/dispatch-support-access-summaries';

  -- Read the service role key from vault if it exists; the email infra setup
  -- already stores one under name 'email_queue_service_role_key'.
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  -- Drop any previous schedule with the same name so this is idempotent.
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'dispatch-support-access-summaries';

  IF service_key IS NOT NULL THEN
    PERFORM cron.schedule(
      'dispatch-support-access-summaries',
      '*/5 * * * *',
      format(
        $job$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        );
        $job$,
        fn_url,
        service_key
      )
    );
  END IF;
END $$;