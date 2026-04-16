-- Security audit: restrict email-assets bucket SELECT to service-role only
-- Previously any authenticated user could read all email template images.
-- These assets are only served via edge functions using the service-role key.

DROP POLICY IF EXISTS "Authenticated users can view email assets" ON storage.objects;

CREATE POLICY "Only service role can read email assets"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'email-assets'
  AND (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);