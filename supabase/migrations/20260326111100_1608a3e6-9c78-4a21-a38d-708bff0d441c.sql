
-- Conversion Goals table
CREATE TABLE public.conversion_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  goal_type text NOT NULL DEFAULT 'cta_click',
  tracking_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_conversion boolean NOT NULL DEFAULT true,
  conversion_value numeric DEFAULT NULL,
  priority_level text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Goal Completions table with full attribution
CREATE TABLE public.goal_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.conversion_goals(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  session_id text,
  visitor_id text,
  event_type text NOT NULL,
  page_url text,
  page_path text,
  referrer text,
  landing_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  target_text text,
  dedupe_key text,
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Dedupe index
CREATE UNIQUE INDEX goal_completions_dedupe ON public.goal_completions (org_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Performance indexes
CREATE INDEX conversion_goals_org_active ON public.conversion_goals (org_id) WHERE is_active = true;
CREATE INDEX goal_completions_org_date ON public.goal_completions (org_id, completed_at);
CREATE INDEX goal_completions_org_goal ON public.goal_completions (org_id, goal_id);

-- RLS
ALTER TABLE public.conversion_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cg_select" ON public.conversion_goals FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "cg_insert" ON public.conversion_goals FOR INSERT TO authenticated WITH CHECK (user_org_role(org_id) IN ('admin', 'member'));
CREATE POLICY "cg_update" ON public.conversion_goals FOR UPDATE TO authenticated USING (user_org_role(org_id) IN ('admin', 'member'));
CREATE POLICY "cg_delete" ON public.conversion_goals FOR DELETE TO authenticated USING (user_org_role(org_id) IN ('admin', 'member'));

CREATE POLICY "gcomp_select" ON public.goal_completions FOR SELECT TO authenticated USING (is_org_member(org_id));

-- Trigger for updated_at
CREATE TRIGGER set_conversion_goals_updated_at BEFORE UPDATE ON public.conversion_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
