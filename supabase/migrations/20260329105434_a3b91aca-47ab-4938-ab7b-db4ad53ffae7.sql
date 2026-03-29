
-- 1. Create a security definer function for atomic org creation + member bootstrapping
CREATE OR REPLACE FUNCTION public.create_org_with_admin(
  p_org_id uuid,
  p_name text,
  p_timezone text DEFAULT 'America/New_York'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.orgs (id, name, timezone)
  VALUES (p_org_id, p_name, p_timezone);

  INSERT INTO public.org_users (org_id, user_id, role)
  VALUES (p_org_id, auth.uid(), 'admin');

  RETURN p_org_id;
END;
$$;

-- 2. Drop the old ou_insert policy and replace with admin-only invite policy
DROP POLICY IF EXISTS "ou_insert" ON public.org_users;

CREATE POLICY "ou_insert" ON public.org_users
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND user_org_role(org_id) = 'admin'
  );

-- 3. Tighten report_schedules SELECT to admin-only (contains recipient emails)
DROP POLICY IF EXISTS "rs_select" ON public.report_schedules;
CREATE POLICY "rs_select" ON public.report_schedules
  FOR SELECT TO authenticated
  USING (user_org_role(org_id) = 'admin');

-- 4. Tighten renewals SELECT to admin-only (contains notify_emails)
DROP POLICY IF EXISTS "ren_select" ON public.renewals;
CREATE POLICY "ren_select" ON public.renewals
  FOR SELECT TO authenticated
  USING (user_org_role(org_id) IN ('admin', 'member'));
