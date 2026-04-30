-- 1. Drop the stale lead-dedup backup table (created 2026-04-29, dedup is verified in production now).
DROP TABLE IF EXISTS public.leads_predupe_backup_2026_04_29;

-- 2. Lock down dashboard_access_grants UPDATE: only admins (org or platform) may modify grants.
DROP POLICY IF EXISTS dashboard_access_grants_update_org ON public.dashboard_access_grants;

-- (dashboard_access_grants_update_admin already requires platform admin — keep it)
-- Add an org-admin path so org admins can revoke/extend their own org's grants but managers cannot.
CREATE POLICY dashboard_access_grants_update_org_admin
  ON public.dashboard_access_grants
  FOR UPDATE
  TO authenticated
  USING (public.user_org_role(org_id) = 'admin')
  WITH CHECK (public.user_org_role(org_id) = 'admin');

-- 3. Make the client-logos bucket private. The existing logos_select_org_members
--    policy already grants authenticated org members read access; flipping `public`
--    to false stops anonymous internet enumeration.
UPDATE storage.buckets SET public = false WHERE id = 'client-logos';