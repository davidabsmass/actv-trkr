
-- 1. Add plan_tier to sites
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'core';

-- 2. Ad spend tracking per source per month
CREATE TABLE public.ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  month date NOT NULL,
  source text NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, month, source)
);
ALTER TABLE public.ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "as_select" ON public.ad_spend FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "as_insert" ON public.ad_spend FOR INSERT WITH CHECK (user_org_role(org_id) = ANY(ARRAY['admin','member']));
CREATE POLICY "as_update" ON public.ad_spend FOR UPDATE USING (user_org_role(org_id) = ANY(ARRAY['admin','member']));
CREATE POLICY "as_delete" ON public.ad_spend FOR DELETE USING (user_org_role(org_id) = ANY(ARRAY['admin','member']));

-- 3. Weekly AI summaries
CREATE TABLE public.weekly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  week_start date NOT NULL,
  sessions_change numeric,
  leads_change numeric,
  conversion_anomalies jsonb DEFAULT '[]',
  top_opportunity text,
  risk_alert text,
  summary_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, week_start)
);
ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select" ON public.weekly_summaries FOR SELECT USING (is_org_member(org_id));

-- 4. Add estimated_value to forms
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS estimated_value numeric DEFAULT 0;
