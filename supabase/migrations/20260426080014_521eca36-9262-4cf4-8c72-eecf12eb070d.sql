ALTER TABLE public.form_health_checks
  ADD COLUMN IF NOT EXISTS last_http_status integer,
  ADD COLUMN IF NOT EXISTS last_failure_reason text;