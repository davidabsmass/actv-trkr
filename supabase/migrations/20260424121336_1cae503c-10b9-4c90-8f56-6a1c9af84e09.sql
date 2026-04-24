-- Support Access Grants: customer-initiated, time-limited troubleshooting access
CREATE TABLE IF NOT EXISTS public.support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  granted_by_user_id uuid,
  granted_by_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','revoked')),
  duration_hours integer NOT NULL DEFAULT 24 CHECK (duration_hours IN (1, 24, 72)),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  revoke_reason text,
  wp_temp_username text,
  wp_user_created boolean NOT NULL DEFAULT false,
  wp_user_deleted boolean NOT NULL DEFAULT false,
  last_staff_access_at timestamptz,
  staff_access_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_access_grants_org ON public.support_access_grants(org_id);
CREATE INDEX IF NOT EXISTS idx_support_access_grants_site ON public.support_access_grants(site_id);
CREATE INDEX IF NOT EXISTS idx_support_access_grants_status ON public.support_access_grants(status, expires_at);

ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;

-- Org admins can view their own org's support grants
CREATE POLICY "Org admins can view their support grants"
ON public.support_access_grants
FOR SELECT
TO authenticated
USING (
  user_org_role(org_id) = 'admin'
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- System admins can view all grants (handled by has_role above)
-- Writes happen via edge functions using service role; no direct client writes

-- Updated-at trigger
CREATE TRIGGER trg_support_access_grants_updated_at
BEFORE UPDATE ON public.support_access_grants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log for support access lifecycle events
CREATE TABLE IF NOT EXISTS public.support_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES public.support_access_grants(id) ON DELETE CASCADE,
  org_id uuid,
  site_id uuid,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('customer','staff','system')),
  actor_user_id uuid,
  actor_email text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_access_log_grant ON public.support_access_log(grant_id);
CREATE INDEX IF NOT EXISTS idx_support_access_log_org ON public.support_access_log(org_id, occurred_at DESC);

ALTER TABLE public.support_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins and system admins can view support access log"
ON public.support_access_log
FOR SELECT
TO authenticated
USING (
  (org_id IS NOT NULL AND user_org_role(org_id) = 'admin')
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Function to auto-expire grants past their expiration
CREATE OR REPLACE FUNCTION public.expire_old_support_grants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.support_access_grants
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'active'
      AND expires_at < now()
    RETURNING id, org_id, site_id
  )
  INSERT INTO public.support_access_log (grant_id, org_id, site_id, event_type, actor_type, message)
  SELECT id, org_id, site_id, 'access_expired', 'system', 'Grant auto-expired by scheduled job'
  FROM expired;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;