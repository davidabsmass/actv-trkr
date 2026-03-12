
CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  full_name text,
  org_id uuid,
  ip_address text,
  user_agent text,
  logged_in_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "le_select_admin" ON public.login_events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_login_events_user ON public.login_events(user_id);
CREATE INDEX idx_login_events_org ON public.login_events(org_id);
CREATE INDEX idx_login_events_time ON public.login_events(logged_in_at DESC);
