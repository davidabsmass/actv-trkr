CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'bug',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fb_insert" ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_org_member(org_id));

CREATE POLICY "fb_select" ON public.feedback FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "fb_select_admin" ON public.feedback FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));