
-- Clear all existing plaintext API keys from the database
UPDATE public.api_keys SET key_plain = NULL;

-- Drop existing storage policies that lack org isolation
DROP POLICY IF EXISTS "Org members can read exports" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read reports" ON storage.objects;
DROP POLICY IF EXISTS "archives_select" ON storage.objects;

-- Create org-scoped storage policies
-- exports: path format will be {org_id}/{filename}
CREATE POLICY "exports_select_org" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'exports' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.org_users WHERE user_id = auth.uid()
    )
  );

-- reports: path format will be {org_id}/{filename}
CREATE POLICY "reports_select_org" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'reports' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.org_users WHERE user_id = auth.uid()
    )
  );

-- archives: already uses {org_id}/... path format
CREATE POLICY "archives_select_org" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'archives' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.org_users WHERE user_id = auth.uid()
    )
  );
