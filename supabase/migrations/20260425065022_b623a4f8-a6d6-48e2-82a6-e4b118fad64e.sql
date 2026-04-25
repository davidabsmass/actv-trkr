DO $$
DECLARE
  v_url text;
  v_anon_key text;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
  IF v_url IS NULL OR length(trim(v_url)) = 0 THEN
    v_url := 'https://qnnxlvoybbmmqoxuqyvf.supabase.co';
  END IF;

  v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnhsdm95YmJtbXFveHVxeXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDE2NDMsImV4cCI6MjA4NzU3NzY0M30.cc--i_pc5dyPI8fE2wB_por06Bjy53mHxjRyDPmAP6I';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-import-queue') THEN
    PERFORM cron.unschedule('process-import-queue');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'form-import-watchdog') THEN
    PERFORM cron.unschedule('form-import-watchdog');
  END IF;

  PERFORM cron.schedule(
    'process-import-queue',
    '*/2 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s',
          'x-cron-secret', COALESCE((SELECT value FROM public.app_config WHERE key = 'cron_secret'), '')
        ),
        body := jsonb_build_object('triggered_by', 'pg_cron')
      ) AS request_id;
    $cron$, v_url || '/functions/v1/process-import-queue', v_anon_key)
  );

  PERFORM cron.schedule(
    'form-import-watchdog',
    '*/10 * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s',
          'x-cron-secret', COALESCE((SELECT value FROM public.app_config WHERE key = 'cron_secret'), '')
        ),
        body := jsonb_build_object('triggered_by', 'pg_cron')
      ) AS request_id;
    $cron$, v_url || '/functions/v1/form-import-watchdog', v_anon_key)
  );
END $$;