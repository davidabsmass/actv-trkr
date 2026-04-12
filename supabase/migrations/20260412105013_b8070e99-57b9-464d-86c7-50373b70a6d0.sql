
-- Drop existing unscoped policies on client-logos bucket
DROP POLICY IF EXISTS "Authenticated users can upload client logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client logos" ON storage.objects;
DROP POLICY IF EXISTS "Client logos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "logos_insert_org_scoped" ON storage.objects;
DROP POLICY IF EXISTS "logos_update_org_scoped" ON storage.objects;
DROP POLICY IF EXISTS "logos_delete_org_scoped" ON storage.objects;
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;

-- Public read access (logos are in a public bucket)
CREATE POLICY "logos_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'client-logos');

-- Org-scoped insert
CREATE POLICY "logos_insert_org_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-logos' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.org_users WHERE user_id = auth.uid()
    )
  );

-- Org-scoped update
CREATE POLICY "logos_update_org_scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-logos' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.org_users WHERE user_id = auth.uid()
    )
  );

-- Org-scoped delete
CREATE POLICY "logos_delete_org_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-logos' AND
    (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.org_users WHERE user_id = auth.uid()
    )
  );
