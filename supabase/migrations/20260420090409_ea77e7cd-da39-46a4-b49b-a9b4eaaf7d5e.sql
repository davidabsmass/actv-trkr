ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.form_integrations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_forms_is_active ON public.forms(org_id, is_active) WHERE is_active = true;