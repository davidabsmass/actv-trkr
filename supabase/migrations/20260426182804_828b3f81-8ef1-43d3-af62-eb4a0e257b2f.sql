-- ============================================================
-- Customer-controlled DASHBOARD access consent
-- (separate from the existing WP-site temp-login system in
--  public.support_access_grants)
-- ============================================================

CREATE TABLE public.dashboard_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  granted_by_user_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  reason text,
  source text NOT NULL DEFAULT 'proactive', -- 'proactive' | 'ticket_request'
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_access_grants_expires_after_grant CHECK (expires_at > granted_at),
  CONSTRAINT dashboard_access_grants_source_chk CHECK (source IN ('proactive','ticket_request'))
);

CREATE INDEX idx_dashboard_access_grants_org_active
  ON public.dashboard_access_grants (org_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_dashboard_access_grants_ticket
  ON public.dashboard_access_grants (ticket_id)
  WHERE ticket_id IS NOT NULL;

CREATE TRIGGER trg_dashboard_access_grants_updated
  BEFORE UPDATE ON public.dashboard_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dashboard_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_access_grants_select_org"
  ON public.dashboard_access_grants FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "dashboard_access_grants_insert_org"
  ON public.dashboard_access_grants FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND granted_by_user_id = auth.uid());

CREATE POLICY "dashboard_access_grants_update_org"
  ON public.dashboard_access_grants FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "dashboard_access_grants_select_admin"
  ON public.dashboard_access_grants FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "dashboard_access_grants_update_admin"
  ON public.dashboard_access_grants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================
-- Audit log
-- ============================================================
CREATE TABLE public.dashboard_access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES public.dashboard_access_grants(id) ON DELETE SET NULL,
  org_id uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dashboard_access_audit_grant ON public.dashboard_access_audit_log (grant_id, occurred_at DESC);
CREATE INDEX idx_dashboard_access_audit_org ON public.dashboard_access_audit_log (org_id, occurred_at DESC);

ALTER TABLE public.dashboard_access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_access_audit_select_org"
  ON public.dashboard_access_audit_log FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "dashboard_access_audit_select_admin"
  ON public.dashboard_access_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "dashboard_access_audit_insert_admin"
  ON public.dashboard_access_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND admin_user_id = auth.uid());

-- ============================================================
-- Helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_active_dashboard_grant(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dashboard_access_grants
    WHERE org_id = _org_id
      AND revoked_at IS NULL
      AND expires_at > now()
  );
$$;