
-- Monthly summaries table
CREATE TABLE public.monthly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  month date NOT NULL,
  summary_text text NOT NULL DEFAULT '',
  top_performers jsonb NOT NULL DEFAULT '[]'::jsonb,
  focus_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, month)
);

ALTER TABLE public.monthly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ms_select" ON public.monthly_summaries
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

-- SEO scans table
CREATE TABLE public.seo_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  url text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  issues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_select" ON public.seo_scans
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));
