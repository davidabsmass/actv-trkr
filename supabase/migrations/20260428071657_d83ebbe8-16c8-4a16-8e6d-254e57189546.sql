-- 1. Drop existing role check FIRST so we can migrate values
ALTER TABLE public.org_users DROP CONSTRAINT IF EXISTS org_users_role_check;

-- 2. Extend org_users with metadata fields
ALTER TABLE public.org_users
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- 3. Migrate existing 'member' -> 'manager'
UPDATE public.org_users SET role = 'manager' WHERE role = 'member';

-- 4. Add new role check constraint
ALTER TABLE public.org_users
  ADD CONSTRAINT org_users_role_check
  CHECK (role = ANY (ARRAY['admin','manager','viewer']));

ALTER TABLE public.org_users DROP CONSTRAINT IF EXISTS org_users_status_check;
ALTER TABLE public.org_users
  ADD CONSTRAINT org_users_status_check
  CHECK (status = ANY (ARRAY['active','invited','removed']));

-- 5. Mark earliest admin per org as owner
WITH first_admin AS (
  SELECT DISTINCT ON (org_id) id, org_id
  FROM public.org_users
  WHERE role = 'admin'
  ORDER BY org_id, created_at ASC, id ASC
)
UPDATE public.org_users ou
   SET is_owner = true
  FROM first_admin
 WHERE ou.id = first_admin.id;

CREATE UNIQUE INDEX IF NOT EXISTS org_users_one_owner_per_org
  ON public.org_users (org_id) WHERE is_owner;

-- 6. Trigger: keep updated_at fresh
DROP TRIGGER IF EXISTS trg_org_users_updated_at ON public.org_users;
CREATE TRIGGER trg_org_users_updated_at
  BEFORE UPDATE ON public.org_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Trigger: auto-promote first member of an org to admin+owner
CREATE OR REPLACE FUNCTION public.org_users_first_member_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing int; v_has_owner boolean;
BEGIN
  SELECT COUNT(*), bool_or(is_owner) INTO v_existing, v_has_owner
    FROM public.org_users WHERE org_id = NEW.org_id AND id <> NEW.id;
  IF v_existing = 0 THEN
    NEW.role := 'admin'; NEW.is_owner := true;
  ELSIF NOT v_has_owner AND NEW.role = 'admin' THEN
    NEW.is_owner := true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_org_users_first_owner ON public.org_users;
CREATE TRIGGER trg_org_users_first_owner
  BEFORE INSERT ON public.org_users
  FOR EACH ROW EXECUTE FUNCTION public.org_users_first_member_owner();

-- 8. Trigger: protect owner & last admin
CREATE OR REPLACE FUNCTION public.org_users_protect_owner_and_last_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin_count int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_owner THEN
      RAISE EXCEPTION 'Cannot remove the organization owner' USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'admin' THEN
      SELECT COUNT(*) INTO v_admin_count FROM public.org_users
       WHERE org_id = OLD.org_id AND role = 'admin' AND id <> OLD.id;
      IF v_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last admin from the organization' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_owner AND NEW.role <> 'admin' THEN
      RAISE EXCEPTION 'Cannot change the role of the organization owner' USING ERRCODE = '42501';
    END IF;
    IF OLD.is_owner AND NEW.is_owner = false THEN
      RAISE EXCEPTION 'Ownership transfer must use a dedicated flow' USING ERRCODE = '42501';
    END IF;
    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      SELECT COUNT(*) INTO v_admin_count FROM public.org_users
       WHERE org_id = OLD.org_id AND role = 'admin' AND id <> OLD.id;
      IF v_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last admin' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_org_users_protect ON public.org_users;
CREATE TRIGGER trg_org_users_protect
  BEFORE UPDATE OR DELETE ON public.org_users
  FOR EACH ROW EXECUTE FUNCTION public.org_users_protect_owner_and_last_admin();

-- 9. Helpers
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_users
                  WHERE user_id = _user_id AND org_id = _org_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_users
                  WHERE user_id = _user_id AND org_id = _org_id AND is_owner = true);
$$;

CREATE OR REPLACE FUNCTION public.is_last_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_users
                  WHERE user_id = _user_id AND org_id = _org_id AND role = 'admin')
     AND (SELECT COUNT(*) FROM public.org_users WHERE org_id = _org_id AND role = 'admin') = 1;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

-- 10. Tighten org_users RLS
DROP POLICY IF EXISTS "ou_select" ON public.org_users;
DROP POLICY IF EXISTS "ou_select_self_or_admin" ON public.org_users;
CREATE POLICY "ou_select_self_or_admin" ON public.org_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin(auth.uid(), org_id)
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "ou_insert" ON public.org_users;
DROP POLICY IF EXISTS "ou_insert_admin_only" ON public.org_users;
CREATE POLICY "ou_insert_admin_only" ON public.org_users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    OR public.is_platform_admin(auth.uid())
    OR (user_id = auth.uid() AND NOT EXISTS (
      SELECT 1 FROM public.org_users ou2 WHERE ou2.org_id = org_users.org_id
    ))
  );

DROP POLICY IF EXISTS "ou_update" ON public.org_users;
DROP POLICY IF EXISTS "ou_update_admin_only" ON public.org_users;
CREATE POLICY "ou_update_admin_only" ON public.org_users
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "ou_delete" ON public.org_users;
DROP POLICY IF EXISTS "ou_delete_admin_only" ON public.org_users;
CREATE POLICY "ou_delete_admin_only" ON public.org_users
  FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

-- 11. Team audit log
CREATE TABLE IF NOT EXISTS public.team_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY[
    'user_invited','user_removed','user_role_changed','admin_added','admin_removed','ownership_transferred'
  ])),
  previous_role text,
  new_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_audit_log_org ON public.team_audit_log(org_id, created_at DESC);

ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tal_select_admin_only" ON public.team_audit_log;
CREATE POLICY "tal_select_admin_only" ON public.team_audit_log
  FOR SELECT TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "tal_no_client_insert" ON public.team_audit_log;
CREATE POLICY "tal_no_client_insert" ON public.team_audit_log
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "tal_no_client_update" ON public.team_audit_log;
CREATE POLICY "tal_no_client_update" ON public.team_audit_log
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS "tal_no_client_delete" ON public.team_audit_log;
CREATE POLICY "tal_no_client_delete" ON public.team_audit_log
  FOR DELETE TO authenticated USING (false);
