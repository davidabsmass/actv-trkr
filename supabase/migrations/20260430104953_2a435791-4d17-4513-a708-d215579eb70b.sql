-- ============================================================
-- ACTV TRKR Support role + Export audit logging
-- ============================================================

-- 1) Helper: is_org_actv_support
CREATE OR REPLACE FUNCTION public.is_org_actv_support(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_users
    WHERE user_id = _user_id AND org_id = _org_id AND role = 'actv_support'
  );
$$;

-- 2) Trigger update — first member should NEVER be actv_support owner
CREATE OR REPLACE FUNCTION public.org_users_first_member_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_existing int; v_has_owner boolean;
BEGIN
  SELECT COUNT(*), bool_or(is_owner) INTO v_existing, v_has_owner
    FROM public.org_users WHERE org_id = NEW.org_id AND id <> NEW.id;
  IF v_existing = 0 AND NEW.role <> 'actv_support' THEN
    NEW.role := 'admin'; NEW.is_owner := true;
  ELSIF NOT COALESCE(v_has_owner, false) AND NEW.role = 'admin' THEN
    NEW.is_owner := true;
  END IF;
  RETURN NEW;
END; $$;

-- 3) Optional metadata columns on org_users (nullable, non-breaking)
ALTER TABLE public.org_users
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS access_granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_granted_at timestamptz NULL;

-- 4) Export audit log table
CREATE TABLE IF NOT EXISTS public.export_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id         uuid NULL REFERENCES public.sites(id) ON DELETE SET NULL,
  user_id         uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  role_at_export  text NOT NULL,
  export_type     text NOT NULL,
  export_scope    text NULL,
  export_job_id   uuid NULL REFERENCES public.export_jobs(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_audit_log_org_created
  ON public.export_audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_audit_log_user_created
  ON public.export_audit_log (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_export_audit_log_job
  ON public.export_audit_log (export_job_id) WHERE export_job_id IS NOT NULL;

ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated org member, must be themselves
CREATE POLICY "Org members can insert their own export audits"
  ON public.export_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.is_org_member(org_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- SELECT: org admins (or platform admins) only
CREATE POLICY "Org admins can read export audits"
  ON public.export_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- No UPDATE/DELETE policies — immutable audit trail.
