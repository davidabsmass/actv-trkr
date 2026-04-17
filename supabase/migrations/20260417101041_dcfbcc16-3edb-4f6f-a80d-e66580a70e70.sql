-- Schedule nightly compute-acquisition-metrics edge function at 04:15 UTC
SELECT cron.schedule(
  'compute-acquisition-metrics-nightly',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/compute-acquisition-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnhsdm95YmJtbXFveHVxeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDE2NDMsImV4cCI6MjA4NzU3NzY0M30.cc--i_pc5dyPI8fE2wB_por06Bjy53mHxjRyDPmAP6I',
      'x-cron-secret', (SELECT value FROM public.app_config WHERE key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);