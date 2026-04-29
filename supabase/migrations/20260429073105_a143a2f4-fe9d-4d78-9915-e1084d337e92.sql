ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS health_check_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_check_disabled_reason text,
  ADD COLUMN IF NOT EXISTS health_check_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_check_disabled_by uuid;

CREATE INDEX IF NOT EXISTS idx_forms_health_check_disabled
  ON public.forms (org_id) WHERE health_check_disabled = true;