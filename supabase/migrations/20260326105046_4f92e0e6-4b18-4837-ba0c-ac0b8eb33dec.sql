
CREATE TABLE public.goals_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  match_type text NOT NULL DEFAULT 'target_text_contains',
  match_value text NOT NULL,
  event_type text NOT NULL DEFAULT 'cta_click',
  is_conversion boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goals_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gc_select" ON public.goals_config
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "gc_insert" ON public.goals_config
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) IN ('admin', 'member'));

CREATE POLICY "gc_update" ON public.goals_config
  FOR UPDATE TO authenticated
  USING (user_org_role(org_id) IN ('admin', 'member'));

CREATE POLICY "gc_delete" ON public.goals_config
  FOR DELETE TO authenticated
  USING (user_org_role(org_id) IN ('admin', 'member'));
