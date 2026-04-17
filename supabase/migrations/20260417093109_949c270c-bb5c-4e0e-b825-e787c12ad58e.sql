-- Schedule the retention flow dispatcher every 15 minutes via pg_cron
DO $$
DECLARE v_url text; v_key text;
BEGIN
  SELECT value INTO v_url FROM public.app_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.app_config WHERE key = 'cron_secret';
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Skipping retention cron — supabase_url or cron_secret not configured in app_config';
    RETURN;
  END IF;

  -- Unschedule existing job if present
  PERFORM cron.unschedule('retention-flow-dispatcher') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-flow-dispatcher');

  PERFORM cron.schedule(
    'retention-flow-dispatcher',
    '*/15 * * * *',
    format($job$ SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L), body := '{}'::jsonb) $job$,
      v_url || '/functions/v1/retention-flow-dispatcher', v_key)
  );
END $$;