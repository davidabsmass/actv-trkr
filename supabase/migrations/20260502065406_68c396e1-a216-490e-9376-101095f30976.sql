-- Reduce email queue polling from every 5 seconds to every 30 seconds.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue'),
  schedule := '30 seconds'
);

-- Tracking health: every 5 min -> every 15 min
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'check-tracking-health-5min'),
  schedule := '*/15 * * * *'
);

-- Support access summaries: every 5 min -> every 15 min
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'dispatch-support-access-summaries'),
  schedule := '*/15 * * * *'
);

-- Stalled alerts: every 5 min -> every 10 min
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-stalled-alerts-5min'),
  schedule := '*/10 * * * *'
);

-- Consolidate duplicate alert processors:
-- Keep process-monitoring-alerts-every-minute (slowed to every 2 min)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-monitoring-alerts-every-minute'),
  schedule := '*/2 * * * *'
);

-- Unschedule the duplicate
SELECT cron.unschedule('process-alerts-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-alerts-1min');