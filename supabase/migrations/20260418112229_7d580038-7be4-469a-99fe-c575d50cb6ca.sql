-- The user's site (bbbedu.com) was registered to an unrelated org (ghoulspodcast.com / 35241d6e)
-- because the WordPress plugin used a license key that pre-existed under that org.
-- The user's actual org is d1bb0cbb ("My Organization"). Move the site and its key.

UPDATE public.sites
SET org_id = 'd1bb0cbb-0936-4424-9c28-08997af2c56b'
WHERE id = 'b37cdaaf-bece-432c-bf5d-ee48790c5255'
  AND org_id = '35241d6e-6064-4f11-9d15-af05426c1030';

UPDATE public.api_keys
SET org_id = 'd1bb0cbb-0936-4424-9c28-08997af2c56b'
WHERE id = '36b9f831-ceca-4026-89d3-747a3483b6f9'
  AND org_id = '35241d6e-6064-4f11-9d15-af05426c1030';

-- Also revoke the older orphan key on d1bb0cbb so the active key matches what the plugin sent.
UPDATE public.api_keys
SET revoked_at = now()
WHERE id = '9926d3ee-237a-47c5-93fb-fcfdc7516c87'
  AND revoked_at IS NULL;