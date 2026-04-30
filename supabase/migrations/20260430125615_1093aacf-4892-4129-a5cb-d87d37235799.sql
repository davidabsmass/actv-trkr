
-- Track onboarding email sends per org (idempotency)
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS onboarding_day1_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_day3_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_day7_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_day12_sent_at timestamptz;

-- Schedule daily onboarding email scheduler at 14:00 UTC
DO $$ BEGIN PERFORM cron.unschedule('onboarding-email-scheduler-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'onboarding-email-scheduler-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/onboarding-email-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnhsdm95YmJtbXFveHVxeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDE2NDMsImV4cCI6MjA4NzU3NzY0M30.cc--i_pc5dyPI8fE2wB_por06Bjy53mHxjRyDPmAP6I',
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
