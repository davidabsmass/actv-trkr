DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-install-integrity-15min') THEN
    PERFORM cron.unschedule('reconcile-install-integrity-15min');
  END IF;
END $$;

SELECT cron.schedule(
  'reconcile-install-integrity-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/reconcile-install-integrity',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnhsdm95YmJtbXFveHVxeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDE2NDMsImV4cCI6MjA4NzU3NzY0M30.cc--i_pc5dyPI8fE2wB_por06Bjy53mHxjRyDPmAP6I',
      'x-cron-secret', COALESCE((SELECT value FROM public.app_config WHERE key = 'cron_secret'), '')
    ),
    body := '{}'::jsonb
  );
  $$
);