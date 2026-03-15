
-- Schedule nightly-summary to run at 6:00 AM UTC daily
SELECT cron.schedule(
  'nightly-summary',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/nightly-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
