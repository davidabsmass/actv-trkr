-- Truncate net responses (instantly reclaims space, no VACUUM needed)
TRUNCATE TABLE net._http_response;

-- Schedule nightly retention jobs
DO $$ BEGIN PERFORM cron.unschedule('purge-cron-history'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('purge-net-responses'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$$
);

SELECT cron.schedule(
  'purge-net-responses',
  '15 3 * * *',
  $$DELETE FROM net._http_response WHERE created < now() - interval '24 hours'$$
);