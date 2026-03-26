
CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  page_path text,
  page_title text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_activity_log_user ON public.user_activity_log(user_id, created_at DESC);
CREATE INDEX idx_user_activity_log_org ON public.user_activity_log(org_id, created_at DESC);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ual_insert" ON public.user_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ual_select_admin" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ual_select_own" ON public.user_activity_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
