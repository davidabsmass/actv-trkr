
-- Fix orgs insert policy: RESTRICTIVE -> PERMISSIVE
DROP POLICY IF EXISTS "org_insert" ON public.orgs;
CREATE POLICY "org_insert" ON public.orgs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix org_users insert policy: RESTRICTIVE -> PERMISSIVE + fix self-join bug
DROP POLICY IF EXISTS "ou_insert" ON public.org_users;
CREATE POLICY "ou_insert" ON public.org_users
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

-- Fix api_keys insert policy: RESTRICTIVE -> PERMISSIVE
DROP POLICY IF EXISTS "ak_insert" ON public.api_keys;
CREATE POLICY "ak_insert" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin');
