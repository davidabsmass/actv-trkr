
-- Nightly summaries table
CREATE TABLE public.nightly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_text text NOT NULL DEFAULT '',
  insights jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_snapshot jsonb DEFAULT NULL,
  UNIQUE(org_id, period_end)
);

ALTER TABLE public.nightly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ns_select" ON public.nightly_summaries
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
