
-- ════════════════════════════════════════════════════════════════
-- Phase 1 continued: Critical security fixes (C-1, C-3, C-4, H-7)
-- ════════════════════════════════════════════════════════════════

-- ── H-7: Stripe webhook event deduplication ──────────────────────
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages processed_stripe_events"
  ON public.processed_stripe_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS processed_stripe_events_processed_at_idx
  ON public.processed_stripe_events (processed_at DESC);

-- ── C-1: Magic-login requestor binding ───────────────────────────
-- Server-side log of magic login token issuance so we can audit
-- requestor identity, IP, single-use enforcement, and revocation.
CREATE TABLE IF NOT EXISTS public.magic_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  requestor_ip_hash text,
  requestor_user_agent text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_ip_hash text,
  revoked_at timestamptz,
  revoked_reason text
);

ALTER TABLE public.magic_login_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages magic_login_tokens"
  ON public.magic_login_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Org admins view their magic login history"
  ON public.magic_login_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_org_role(org_id) = 'admin');

CREATE INDEX IF NOT EXISTS magic_login_tokens_org_idx
  ON public.magic_login_tokens (org_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS magic_login_tokens_site_idx
  ON public.magic_login_tokens (site_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS magic_login_tokens_expires_idx
  ON public.magic_login_tokens (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- ── C-3 foundation: Site-scoped ingest tokens ────────────────────
-- A separate, narrow-scope token used only by tracker.js / heartbeat.js.
-- This separates the public-page-source ingestion key from the
-- admin api_keys.key_hash (which can call privileged endpoints like
-- magic-login). Compromise of an ingest token cannot grant admin access.
CREATE TABLE IF NOT EXISTS public.site_ingest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  -- Domain this token is bound to; ingestion must verify Origin/payload domain matches.
  bound_domain text NOT NULL,
  scope text NOT NULL DEFAULT 'ingest' CHECK (scope IN ('ingest')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','rotating','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.site_ingest_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages site_ingest_tokens"
  ON public.site_ingest_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Org admins view ingest tokens for their org"
  ON public.site_ingest_tokens
  FOR SELECT
  TO authenticated
  USING (public.user_org_role(org_id) = 'admin');

CREATE INDEX IF NOT EXISTS site_ingest_tokens_org_idx
  ON public.site_ingest_tokens (org_id);
CREATE INDEX IF NOT EXISTS site_ingest_tokens_site_idx
  ON public.site_ingest_tokens (site_id);
CREATE INDEX IF NOT EXISTS site_ingest_tokens_active_idx
  ON public.site_ingest_tokens (site_id)
  WHERE status = 'active';

-- ── C-4 foundation: Plugin release signing keys ──────────────────
-- Stores the public key fingerprint(s) that the WordPress plugin trusts
-- to verify plugin update payloads. The private key lives in env secrets.
CREATE TABLE IF NOT EXISTS public.plugin_release_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_fingerprint text NOT NULL UNIQUE,
  algorithm text NOT NULL DEFAULT 'HMAC-SHA256' CHECK (algorithm IN ('HMAC-SHA256')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  notes text
);

ALTER TABLE public.plugin_release_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages plugin_release_keys"
  ON public.plugin_release_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view active release keys"
  ON public.plugin_release_keys
  FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Plugin update fetch log (helpful for detecting tampering attempts)
CREATE TABLE IF NOT EXISTS public.plugin_update_fetches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text,
  current_version text,
  served_version text,
  signature_issued boolean NOT NULL DEFAULT false,
  signature_alg text,
  ip_hash text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plugin_update_fetches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages plugin_update_fetches"
  ON public.plugin_update_fetches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS plugin_update_fetches_domain_idx
  ON public.plugin_update_fetches (domain, occurred_at DESC);
