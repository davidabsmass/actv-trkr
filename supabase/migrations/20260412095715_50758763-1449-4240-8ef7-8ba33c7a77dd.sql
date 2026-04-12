
-- =============================================
-- form_integrations: tracks each discovered form
-- =============================================
CREATE TABLE public.form_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  builder_type TEXT NOT NULL DEFAULT 'gravity_forms',
  external_form_id TEXT NOT NULL,
  form_name TEXT NOT NULL DEFAULT 'Untitled Form',
  status TEXT NOT NULL DEFAULT 'detected',
  total_entries_estimated INTEGER NOT NULL DEFAULT 0,
  total_entries_imported INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, builder_type, external_form_id)
);

ALTER TABLE public.form_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fi_select" ON public.form_integrations FOR SELECT TO authenticated
  USING (is_org_member(org_id));
CREATE POLICY "fi_insert" ON public.form_integrations FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin','member']));
CREATE POLICY "fi_update" ON public.form_integrations FOR UPDATE TO authenticated
  USING (user_org_role(org_id) = ANY (ARRAY['admin','member']));

CREATE INDEX idx_fi_site ON public.form_integrations(site_id);
CREATE INDEX idx_fi_org ON public.form_integrations(org_id);

CREATE TRIGGER update_form_integrations_updated_at
  BEFORE UPDATE ON public.form_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- form_import_jobs: resumable import jobs
-- =============================================
CREATE TABLE public.form_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  form_integration_id UUID NOT NULL REFERENCES public.form_integrations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  cursor TEXT,
  batch_size INTEGER NOT NULL DEFAULT 100,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_expected INTEGER NOT NULL DEFAULT 0,
  last_batch_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fij_select" ON public.form_import_jobs FOR SELECT TO authenticated
  USING (is_org_member(org_id));
CREATE POLICY "fij_insert" ON public.form_import_jobs FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin','member']));
CREATE POLICY "fij_update" ON public.form_import_jobs FOR UPDATE TO authenticated
  USING (user_org_role(org_id) = ANY (ARRAY['admin','member']));

CREATE INDEX idx_fij_integration ON public.form_import_jobs(form_integration_id);
CREATE INDEX idx_fij_status ON public.form_import_jobs(status);

CREATE TRIGGER update_form_import_jobs_updated_at
  BEFORE UPDATE ON public.form_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- form_entries: normalized imported entries
-- =============================================
CREATE TABLE public.form_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  form_integration_id UUID NOT NULL REFERENCES public.form_integrations(id) ON DELETE CASCADE,
  builder_type TEXT NOT NULL,
  source_entry_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  normalized_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, builder_type, source_entry_id)
);

ALTER TABLE public.form_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fe_select" ON public.form_entries FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE INDEX idx_fe_integration ON public.form_entries(form_integration_id);
CREATE INDEX idx_fe_submitted ON public.form_entries(submitted_at);
CREATE INDEX idx_fe_source ON public.form_entries(site_id, builder_type, source_entry_id);
