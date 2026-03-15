
-- Store config values needed by cron jobs
INSERT INTO public.app_config (key, value) VALUES
  ('supabase_url', 'https://qnnxlvoybbmmqoxuqyvf.supabase.co')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
