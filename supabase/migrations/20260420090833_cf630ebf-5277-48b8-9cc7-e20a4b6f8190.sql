ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS last_form_discovery_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sites_last_form_discovery ON public.sites(last_form_discovery_at NULLS FIRST);