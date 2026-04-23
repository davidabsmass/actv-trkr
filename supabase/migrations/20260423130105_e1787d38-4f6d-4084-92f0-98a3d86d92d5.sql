ALTER TABLE public.consent_config
  ADD COLUMN IF NOT EXISTS limited_pre_consent_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.consent_config.limited_pre_consent_enabled IS
  'When true, plugin sends anonymous pageview-only data before consent (no IDs, cookies, journey stitching). Off by default. Source of truth: WP plugin mm_options.limited_pre_consent.';