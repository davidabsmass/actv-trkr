
-- Add page_url column to forms table
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS page_url text;

-- Create form_health_checks table
CREATE TABLE public.form_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  form_id uuid NOT NULL REFERENCES public.forms(id),
  is_rendered boolean NOT NULL DEFAULT true,
  page_url text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_rendered_at timestamptz,
  UNIQUE (org_id, site_id, form_id)
);

ALTER TABLE public.form_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fhc_select" ON public.form_health_checks
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE INDEX idx_fhc_org_site ON public.form_health_checks(org_id, site_id);
CREATE INDEX idx_fhc_form ON public.form_health_checks(form_id);
