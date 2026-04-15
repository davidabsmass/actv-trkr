
-- ============================================================
-- 1. LOGIN_EVENTS: scope SELECT to the user's own org only
-- ============================================================
DROP POLICY IF EXISTS "le_select_admin" ON public.login_events;

CREATE POLICY "le_select_org_admin"
  ON public.login_events
  FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.is_org_member(org_id)
    AND public.user_org_role(org_id) = 'admin'
  );

-- ============================================================
-- 2. CLIENT-LOGOS: remove overly broad authenticated policies
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

-- ============================================================
-- 3. SITE_VISITORS: hide wp_user_email from non-admin members
-- ============================================================
CREATE OR REPLACE VIEW public.site_visitors_safe
WITH (security_invoker = on) AS
  SELECT
    id, org_id, site_id, visitor_id,
    wp_user_id, wp_user_name, wp_user_role,
    wp_user_email_hash,
    first_seen_at, last_seen_at
  FROM public.site_visitors;

DROP POLICY IF EXISTS "Org members can view site visitors" ON public.site_visitors;

CREATE POLICY "Org admins can view site visitors"
  ON public.site_visitors
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id)
    AND public.user_org_role(org_id) = 'admin'
  );

-- Non-admin org members: grant access to the safe view via base table
-- but only through the view (which excludes wp_user_email)
CREATE POLICY "Org members can view site visitors via safe view"
  ON public.site_visitors
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id)
  );

-- Actually, since both policies are permissive (OR logic), the member
-- policy would expose everything. Instead, just restrict to admin only
-- and have the app use the view for non-admins.
DROP POLICY IF EXISTS "Org members can view site visitors via safe view" ON public.site_visitors;

-- ============================================================
-- 4. PUBLIC BUCKET LISTING: prevent anonymous listing
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'email-assets';
UPDATE storage.buckets SET public = false WHERE id = 'client-logos';

-- Allow anyone to read email-asset files by direct path
CREATE POLICY "email_assets_select_by_path"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'email-assets');
