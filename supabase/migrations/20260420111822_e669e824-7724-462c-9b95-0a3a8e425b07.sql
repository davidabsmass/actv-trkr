-- =====================================================================
-- PART 1: Email 2FA infrastructure
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.mfa_email_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  challenge_token_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_codes_user_idx ON public.mfa_email_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mfa_codes_challenge_idx ON public.mfa_email_codes (challenge_token_hash) WHERE consumed_at IS NULL;

ALTER TABLE public.mfa_email_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mfa_codes_service_role_all"
  ON public.mfa_email_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.purge_expired_mfa_codes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.mfa_email_codes
  WHERE expires_at < now() - INTERVAL '1 hour'
     OR (consumed_at IS NOT NULL AND consumed_at < now() - INTERVAL '1 hour');
$$;

-- =====================================================================
-- PART 2: Security findings remediation
-- =====================================================================

-- 2a. subscribers — block authenticated write paths
DROP POLICY IF EXISTS "subscribers_block_authenticated_insert" ON public.subscribers;
CREATE POLICY "subscribers_block_authenticated_insert"
  ON public.subscribers
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "subscribers_block_authenticated_update" ON public.subscribers;
CREATE POLICY "subscribers_block_authenticated_update"
  ON public.subscribers
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "subscribers_block_authenticated_delete" ON public.subscribers;
CREATE POLICY "subscribers_block_authenticated_delete"
  ON public.subscribers
  FOR DELETE
  TO authenticated
  USING (false);

-- 2c. login_events — hash IPs, clear raw values
ALTER TABLE public.login_events ADD COLUMN IF NOT EXISTS ip_hash TEXT;

UPDATE public.login_events
SET ip_hash = encode(digest(ip_address, 'sha256'), 'hex')
WHERE ip_address IS NOT NULL AND (ip_hash IS NULL OR ip_hash = '');

UPDATE public.login_events
SET ip_address = NULL
WHERE ip_address IS NOT NULL;

-- 2d. data_room_access_log — same treatment
ALTER TABLE public.data_room_access_log ADD COLUMN IF NOT EXISTS ip_hash TEXT;

UPDATE public.data_room_access_log
SET ip_hash = encode(digest(ip_address, 'sha256'), 'hex')
WHERE ip_address IS NOT NULL AND (ip_hash IS NULL OR ip_hash = '');

UPDATE public.data_room_access_log
SET ip_address = NULL
WHERE ip_address IS NOT NULL;

-- 2e. orders — restrict customer PII to org admins only
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_select_admin_only" ON public.orders;
CREATE POLICY "orders_select_admin_only"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.user_org_role(org_id) = 'admin');

-- 2f. client-logos bucket — restrict SELECT to authenticated org members only
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;
DROP POLICY IF EXISTS "logos_select_org_members" ON storage.objects;
CREATE POLICY "logos_select_org_members"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-logos'
    AND EXISTS (
      SELECT 1 FROM public.org_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.org_id::text = (storage.foldername(name))[1]
    )
  );

-- 2g. suppressed_emails — admin DELETE so suppressions can be lifted
DROP POLICY IF EXISTS "suppressed_emails_admin_delete" ON public.suppressed_emails;
CREATE POLICY "suppressed_emails_admin_delete"
  ON public.suppressed_emails
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2h. email_send_log — admin SELECT so admins can audit
DROP POLICY IF EXISTS "email_send_log_admin_select" ON public.email_send_log;
CREATE POLICY "email_send_log_admin_select"
  ON public.email_send_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
