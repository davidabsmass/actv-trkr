ALTER TABLE public.magic_login_tokens
  ADD COLUMN IF NOT EXISTS requested_by_email text;

COMMENT ON COLUMN public.magic_login_tokens.requested_by_email IS
  'Email of the dashboard user who issued the magic-login. Passed back to the WordPress plugin so it can authenticate as the matching WP admin account (Security Audit C-1).';