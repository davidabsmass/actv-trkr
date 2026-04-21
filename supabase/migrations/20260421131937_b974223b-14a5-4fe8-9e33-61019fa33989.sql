UPDATE storage.objects
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{cacheControl}',
  '"public, max-age=31536000, immutable"'
)
WHERE bucket_id = 'email-assets'
  AND name = 'actv-trkr-email-header.jpg';