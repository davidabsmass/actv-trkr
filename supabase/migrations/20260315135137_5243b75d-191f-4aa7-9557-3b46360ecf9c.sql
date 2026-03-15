
-- Drop old cron and recreate with service role auth
SELECT cron.unschedule('nightly-summary');

SELECT cron.schedule(
  'nightly-summary',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/nightly-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
