DELETE FROM cron.job_run_details
WHERE start_time < now() - interval '24 hours';

DELETE FROM net._http_response
WHERE created < now() - interval '1 hour';

DO $$ BEGIN PERFORM cron.unschedule('purge-cron-history'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('purge-net-responses'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'purge-cron-history',
  '0 * * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '24 hours'$$
);

SELECT cron.schedule(
  'purge-net-responses',
  '15 * * * *',
  $$DELETE FROM net._http_response WHERE created < now() - interval '1 hour'$$
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'),
  schedule := '* * * * *'
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-monitoring-alerts-every-minute'),
  schedule := '*/3 * * * *'
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-import-queue'),
  schedule := '*/3 * * * *'
);
