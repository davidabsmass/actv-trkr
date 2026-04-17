-- Schedule weekly Acquisition Readiness digest every Monday 14:00 UTC
SELECT cron.schedule(
  'acquisition-weekly-digest',
  '0 14 * * 1',
  $$
  SELECT net.http_post(
    url:='https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/acquisition-weekly-digest',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnhsdm95YmJtbXFveHVxeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDE2NDMsImV4cCI6MjA4NzU3NzY0M30.cc--i_pc5dyPI8fE2wB_por06Bjy53mHxjRyDPmAP6I"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);