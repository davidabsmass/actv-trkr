-- 1. Drop dangerous invite_codes public lookup policy
DROP POLICY IF EXISTS "ic_public_lookup" ON public.invite_codes;

-- 2. Replace dashboard_snapshots public policy with org-scoped one
DROP POLICY IF EXISTS "ds_select_public" ON public.dashboard_snapshots;
CREATE POLICY "ds_select_org" ON public.dashboard_snapshots
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));