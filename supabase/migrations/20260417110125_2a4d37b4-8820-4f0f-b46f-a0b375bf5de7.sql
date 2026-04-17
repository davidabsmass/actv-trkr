-- ════════════════════════════════════════════════════════════════════
-- PHASE 1 — Security hardening schema (defense-in-depth foundations)
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Security audit log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  site_id     uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  user_id     uuid,
  actor_type  text NOT NULL DEFAULT 'system'
              CHECK (actor_type IN ('system','admin','user','plugin','webhook','anonymous')),
  event_type  text NOT NULL,
  severity    text NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info','warn','error','critical')),
  message     text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash     text,
  user_agent  text,
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sec_audit_org_created_idx
  ON public.security_audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sec_audit_site_created_idx
  ON public.security_audit_log (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sec_audit_event_severity_idx
  ON public.security_audit_log (event_type, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS sec_audit_severity_created_idx
  ON public.security_audit_log (severity, created_at DESC)
  WHERE severity IN ('error','critical');

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sec_audit_select_self_admin
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (
    (org_id IS NOT NULL AND public.user_org_role(org_id) = 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ─── 2. Site-scoped credentials ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_credentials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id            uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  credential_type    text NOT NULL DEFAULT 'plugin_signing'
                     CHECK (credential_type IN ('plugin_signing','ingest_token','magic_login_session')),
  fingerprint_sha256 text NOT NULL,
  secret_hash        text NOT NULL,
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','rotating','revoked','expired')),
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  last_used_at       timestamptz,
  last_used_ip_hash  text,
  revoked_at         timestamptz,
  revoked_reason     text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT site_credentials_fingerprint_unique UNIQUE (fingerprint_sha256)
);
CREATE INDEX IF NOT EXISTS site_creds_site_status_idx
  ON public.site_credentials (site_id, status);
CREATE INDEX IF NOT EXISTS site_creds_org_status_idx
  ON public.site_credentials (org_id, status);

ALTER TABLE public.site_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_creds_select_admin
  ON public.site_credentials FOR SELECT TO authenticated
  USING (public.user_org_role(org_id) = 'admin'
         OR public.has_role(auth.uid(), 'admin'));

-- ─── 3. Credential rotation events ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credential_rotation_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_credential_id  uuid REFERENCES public.site_credentials(id) ON DELETE CASCADE,
  org_id              uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  site_id             uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  event_type          text NOT NULL
                      CHECK (event_type IN ('issued','rotated','revoked','expired','reused_after_revoke')),
  actor_user_id       uuid,
  actor_type          text NOT NULL DEFAULT 'system',
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS cred_rot_credential_idx
  ON public.credential_rotation_events (site_credential_id, occurred_at DESC);

ALTER TABLE public.credential_rotation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY cred_rot_select_admin
  ON public.credential_rotation_events FOR SELECT TO authenticated
  USING ((org_id IS NOT NULL AND public.user_org_role(org_id) = 'admin')
         OR public.has_role(auth.uid(), 'admin'));

-- ─── 4. Webhook verification log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_verification_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             text NOT NULL,
  event_id             text,
  verification_status  text NOT NULL
                       CHECK (verification_status IN ('verified','signature_invalid','replay_rejected','idempotent_skip','processing_error')),
  failure_reason       text,
  request_id           text,
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS webhook_verify_provider_status_idx
  ON public.webhook_verification_log (provider, verification_status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS webhook_verify_event_id_idx
  ON public.webhook_verification_log (provider, event_id);

ALTER TABLE public.webhook_verification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_verify_select_admin
  ON public.webhook_verification_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 5. Stripe event idempotency (fixes H-7) ────────────────────────
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  summary      jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY stripe_evt_select_admin
  ON public.processed_stripe_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 6. Security alerts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity     text NOT NULL
               CHECK (severity IN ('info','warn','error','critical')),
  alert_type   text NOT NULL,
  org_id       uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  site_id      uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','acknowledged','resolved','suppressed')),
  summary      text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at  timestamptz,
  resolved_by  uuid,
  resolution_notes text
);
CREATE INDEX IF NOT EXISTS sec_alerts_status_severity_idx
  ON public.security_alerts (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS sec_alerts_org_idx
  ON public.security_alerts (org_id, created_at DESC);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY sec_alerts_select_admin
  ON public.security_alerts FOR SELECT TO authenticated
  USING ((org_id IS NOT NULL AND public.user_org_role(org_id) = 'admin')
         OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sec_alerts_update_admin
  ON public.security_alerts FOR UPDATE TO authenticated
  USING ((org_id IS NOT NULL AND public.user_org_role(org_id) = 'admin')
         OR public.has_role(auth.uid(), 'admin'));

-- ─── 7. Release gate checks ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.release_gate_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_ref  text NOT NULL,
  check_name   text NOT NULL,
  status       text NOT NULL CHECK (status IN ('pass','fail','warn')),
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS release_gate_release_idx
  ON public.release_gate_checks (release_ref, created_at DESC);
ALTER TABLE public.release_gate_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY release_gate_select_admin
  ON public.release_gate_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 8. Helper: log security event (server-side only) ───────────────
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_severity   text DEFAULT 'info',
  p_org_id     uuid DEFAULT NULL,
  p_site_id    uuid DEFAULT NULL,
  p_user_id    uuid DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_message    text DEFAULT NULL,
  p_metadata   jsonb DEFAULT '{}'::jsonb,
  p_ip_hash    text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.security_audit_log
    (org_id, site_id, user_id, actor_type, event_type, severity,
     message, metadata, ip_hash, user_agent, request_id)
  VALUES
    (p_org_id, p_site_id, p_user_id, p_actor_type, p_event_type, p_severity,
     p_message, COALESCE(p_metadata, '{}'::jsonb), p_ip_hash, p_user_agent, p_request_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_security_event(text,text,uuid,uuid,uuid,text,text,jsonb,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text,text,uuid,uuid,uuid,text,text,jsonb,text,text,text) TO service_role;