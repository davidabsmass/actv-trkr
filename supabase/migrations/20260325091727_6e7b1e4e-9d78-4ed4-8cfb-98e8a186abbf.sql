
CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'failed_login', 'brute_force', 'new_ip_login', 'file_changed', 'file_added', 'file_deleted'
  severity text NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  title text NOT NULL DEFAULT '',
  details jsonb DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read security events"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX idx_security_events_org ON public.security_events(org_id, occurred_at DESC);
CREATE INDEX idx_security_events_type ON public.security_events(event_type);
