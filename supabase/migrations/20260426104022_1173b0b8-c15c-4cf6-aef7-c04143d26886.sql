-- ============================================================
-- Anti-takeover hardening: tables for alerts, sessions,
-- trusted devices, email-change protection, reset rate limit
-- ============================================================

-- 1. Auth event alerts: one row per (user, event_type, sent_email)
--    so we can throttle / dedupe and store the kill-switch token.
CREATE TABLE IF NOT EXISTS public.auth_event_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  geo_hint TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Kill-switch token (hashed). Click → revoke sessions + lock account.
  kill_token_hash TEXT,
  kill_token_expires_at TIMESTAMPTZ,
  kill_token_consumed_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_event_alerts_user_idx
  ON public.auth_event_alerts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_event_alerts_kill_idx
  ON public.auth_event_alerts (kill_token_hash) WHERE kill_token_consumed_at IS NULL;

ALTER TABLE public.auth_event_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_event_alerts_service_all"
  ON public.auth_event_alerts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_event_alerts_owner_select"
  ON public.auth_event_alerts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Recent sign-ins log (per-user device history for /account panel)
CREATE TABLE IF NOT EXISTS public.auth_recent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  geo_hint TEXT,
  device_fingerprint TEXT,
  signed_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

CREATE INDEX IF NOT EXISTS auth_recent_sessions_user_idx
  ON public.auth_recent_sessions (user_id, signed_in_at DESC);

ALTER TABLE public.auth_recent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_recent_sessions_service_all"
  ON public.auth_recent_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_recent_sessions_owner_select"
  ON public.auth_recent_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Trusted devices (skip email 2FA for known browsers, 30 days)
CREATE TABLE IF NOT EXISTS public.auth_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_trusted_devices_user_idx
  ON public.auth_trusted_devices (user_id, expires_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE public.auth_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_trusted_devices_service_all"
  ON public.auth_trusted_devices FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_trusted_devices_owner_select"
  ON public.auth_trusted_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "auth_trusted_devices_owner_revoke"
  ON public.auth_trusted_devices FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND revoked_at IS NOT NULL);

-- 4. Email-change pending: dual-confirmation + 1h cancel window
CREATE TABLE IF NOT EXISTS public.auth_email_change_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  cancel_token_hash TEXT NOT NULL UNIQUE,
  effective_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_email_change_pending_user_idx
  ON public.auth_email_change_pending (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_change_pending_pending_idx
  ON public.auth_email_change_pending (effective_at)
  WHERE cancelled_at IS NULL AND applied_at IS NULL;

ALTER TABLE public.auth_email_change_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_change_pending_service_all"
  ON public.auth_email_change_pending FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "email_change_pending_owner_select"
  ON public.auth_email_change_pending FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 5. Password-reset rate limit: 3 per email per hour
CREATE TABLE IF NOT EXISTS public.auth_password_reset_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_pwd_reset_email_idx
  ON public.auth_password_reset_log (email, requested_at DESC);

ALTER TABLE public.auth_password_reset_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwd_reset_log_service_all"
  ON public.auth_password_reset_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. Helper function: rate-limit check (true = allowed, false = blocked)
CREATE OR REPLACE FUNCTION public.check_password_reset_rate_limit(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.auth_password_reset_log
  WHERE email = LOWER(TRIM(p_email))
    AND requested_at > now() - INTERVAL '1 hour';
  RETURN v_count < 3;
END;
$$;

-- 7. Cleanup: purge stale rows (called by existing cron path or on-demand)
CREATE OR REPLACE FUNCTION public.purge_auth_hardening_stale()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_password_reset_log
    WHERE requested_at < now() - INTERVAL '24 hours';
  DELETE FROM public.auth_event_alerts
    WHERE created_at < now() - INTERVAL '90 days';
  DELETE FROM public.auth_recent_sessions
    WHERE signed_in_at < now() - INTERVAL '90 days';
  DELETE FROM public.auth_trusted_devices
    WHERE expires_at < now() - INTERVAL '7 days' OR revoked_at < now() - INTERVAL '7 days';
  DELETE FROM public.auth_email_change_pending
    WHERE created_at < now() - INTERVAL '30 days';
$$;