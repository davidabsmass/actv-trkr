CREATE TABLE public.report_custom_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Report Template',
  sections_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, name)
);

ALTER TABLE public.report_custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rct_select" ON public.report_custom_templates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "rct_insert" ON public.report_custom_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_org_member(org_id));

CREATE POLICY "rct_update" ON public.report_custom_templates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "rct_delete" ON public.report_custom_templates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);