
-- Fix orgs insert policy: explicitly PERMISSIVE
DROP POLICY IF EXISTS "org_insert" ON public.orgs;
CREATE POLICY "org_insert" ON public.orgs AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix org_users insert policy: explicitly PERMISSIVE
DROP POLICY IF EXISTS "ou_insert" ON public.org_users;
CREATE POLICY "ou_insert" ON public.org_users AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      user_org_role(org_id) = 'admin'
      OR NOT EXISTS (
        SELECT 1 FROM public.org_users ou2
        WHERE ou2.org_id = org_users.org_id
      )
    )
  );

-- Fix api_keys insert policy: explicitly PERMISSIVE
DROP POLICY IF EXISTS "ak_insert" ON public.api_keys;
CREATE POLICY "ak_insert" ON public.api_keys AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin');

-- Also fix SELECT policies that need to be PERMISSIVE for the flow to work
DROP POLICY IF EXISTS "org_select" ON public.orgs;
CREATE POLICY "org_select" ON public.orgs AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_org_member(id));

DROP POLICY IF EXISTS "org_update" ON public.orgs;
CREATE POLICY "org_update" ON public.orgs AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (user_org_role(id) = 'admin');

DROP POLICY IF EXISTS "ou_select" ON public.org_users;
CREATE POLICY "ou_select" ON public.org_users AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

DROP POLICY IF EXISTS "ou_update" ON public.org_users;
CREATE POLICY "ou_update" ON public.org_users AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (user_org_role(org_id) = 'admin');

DROP POLICY IF EXISTS "ou_delete" ON public.org_users;
CREATE POLICY "ou_delete" ON public.org_users AS PERMISSIVE
  FOR DELETE TO authenticated
  USING (user_org_role(org_id) = 'admin');

DROP POLICY IF EXISTS "ak_select" ON public.api_keys;
CREATE POLICY "ak_select" ON public.api_keys AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (user_org_role(org_id) = 'admin');

DROP POLICY IF EXISTS "ak_update" ON public.api_keys;
CREATE POLICY "ak_update" ON public.api_keys AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (user_org_role(org_id) = 'admin');
