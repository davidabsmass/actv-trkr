
-- =========================================================
-- 1. security_findings
-- =========================================================
CREATE TABLE IF NOT EXISTS public.security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text NOT NULL,
  recommended_fix text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS idx_sec_findings_org_status
  ON public.security_findings (org_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_findings_org_severity
  ON public.security_findings (org_id, severity) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sec_findings_open_dedupe
  ON public.security_findings (org_id, dedupe_key)
  WHERE status = 'open' AND dedupe_key IS NOT NULL;

ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sf_select_admin"
  ON public.security_findings FOR SELECT
  TO authenticated
  USING (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sf_insert_admin"
  ON public.security_findings FOR INSERT
  TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sf_update_admin"
  ON public.security_findings FOR UPDATE
  TO authenticated
  USING (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sec_findings_updated
  BEFORE UPDATE ON public.security_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. security_release_checks
-- =========================================================
CREATE TABLE IF NOT EXISTS public.security_release_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('safe','needs_attention','at_risk','vulnerable','blocked')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_release_checks_org
  ON public.security_release_checks (org_id, created_at DESC);

ALTER TABLE public.security_release_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "src_select_admin"
  ON public.security_release_checks FOR SELECT
  TO authenticated
  USING (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "src_insert_admin"
  ON public.security_release_checks FOR INSERT
  TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 3. backup_health
-- =========================================================
CREATE TABLE IF NOT EXISTS public.backup_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  last_backup_at timestamptz,
  last_restore_test_at timestamptz,
  status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bh_select_admin"
  ON public.backup_health FOR SELECT
  TO authenticated
  USING (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "bh_modify_admin"
  ON public.backup_health FOR ALL
  TO authenticated
  USING (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_org_role(org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_backup_health_updated
  BEFORE UPDATE ON public.backup_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 4. compute_security_score
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_security_score(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 100;
  v_reasons jsonb := '[]'::jsonb;
  v_status text;
  v_critical_count integer;
  v_high_count integer;
  v_exposed_secret integer;
  v_bh record;
  v_recent_auth_signals integer;
  v_stale_keys integer;
  v_active_keys integer;
  v_webhook_failures_7d integer;
BEGIN
  -- Critical findings
  SELECT COUNT(*) INTO v_critical_count
  FROM public.security_findings
  WHERE org_id = p_org_id AND status = 'open' AND severity = 'critical';
  IF v_critical_count > 0 THEN
    v_score := v_score - 40;
    v_reasons := v_reasons || jsonb_build_object('label', v_critical_count || ' open critical finding(s)', 'category', 'findings', 'weight', 40);
  END IF;

  -- High findings (capped)
  SELECT COUNT(*) INTO v_high_count
  FROM public.security_findings
  WHERE org_id = p_org_id AND status = 'open' AND severity = 'high';
  IF v_high_count > 0 THEN
    v_score := v_score - LEAST(v_high_count * 20, 60);
    v_reasons := v_reasons || jsonb_build_object('label', v_high_count || ' open high finding(s)', 'category', 'findings', 'weight', LEAST(v_high_count * 20, 60));
  END IF;

  -- Backup health
  SELECT * INTO v_bh FROM public.backup_health WHERE org_id = p_org_id;
  IF v_bh.last_backup_at IS NULL OR v_bh.last_backup_at < now() - interval '7 days' THEN
    v_score := v_score - 10;
    v_reasons := v_reasons || jsonb_build_object('label', 'Backup is stale or missing', 'category', 'backup', 'weight', 10);
  END IF;
  IF v_bh.last_restore_test_at IS NULL OR v_bh.last_restore_test_at < now() - interval '90 days' THEN
    v_score := v_score - 10;
    v_reasons := v_reasons || jsonb_build_object('label', 'Restore test is stale or missing', 'category', 'backup', 'weight', 10);
  END IF;

  -- Webhook verification gaps (last 7d)
  SELECT COUNT(*) INTO v_webhook_failures_7d
  FROM public.webhook_verification_log
  WHERE created_at > now() - interval '7 days'
    AND verification_status IN ('signature_invalid','replay_rejected');
  IF v_webhook_failures_7d > 5 THEN
    v_score := v_score - 10;
    v_reasons := v_reasons || jsonb_build_object('label', 'Webhook verification rejecting requests', 'category', 'webhooks', 'weight', 10);
  END IF;

  -- Exposed secret findings
  SELECT COUNT(*) INTO v_exposed_secret
  FROM public.security_findings
  WHERE org_id = p_org_id AND status = 'open' AND type = 'exposed_secret';
  IF v_exposed_secret > 0 THEN
    v_score := v_score - 10;
    v_reasons := v_reasons || jsonb_build_object('label', 'Possible exposed secret detected', 'category', 'secrets', 'weight', 10);
  END IF;

  -- Recent auth signals (logins in last 30d)
  SELECT COUNT(*) INTO v_recent_auth_signals
  FROM public.login_events
  WHERE org_id = p_org_id AND logged_in_at > now() - interval '30 days';
  IF v_recent_auth_signals = 0 THEN
    v_score := v_score - 5;
    v_reasons := v_reasons || jsonb_build_object('label', 'No recent login activity', 'category', 'auth', 'weight', 5);
  END IF;

  -- Stale active API keys (not used in 90d, not revoked)
  SELECT COUNT(*) INTO v_stale_keys
  FROM public.api_keys
  WHERE org_id = p_org_id AND revoked_at IS NULL
    AND created_at < now() - interval '90 days';
  SELECT COUNT(*) INTO v_active_keys
  FROM public.api_keys
  WHERE org_id = p_org_id AND revoked_at IS NULL;
  IF v_stale_keys > 0 THEN
    v_score := v_score - 5;
    v_reasons := v_reasons || jsonb_build_object('label', v_stale_keys || ' API key(s) inactive 90d+', 'category', 'api_keys', 'weight', 5);
  END IF;

  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;

  v_status := CASE
    WHEN v_critical_count > 0 THEN 'blocked'
    WHEN v_score < 50 THEN 'vulnerable'
    WHEN v_score < 70 THEN 'at_risk'
    WHEN v_score < 90 THEN 'needs_attention'
    ELSE 'safe'
  END;

  RETURN jsonb_build_object(
    'score', v_score,
    'status', v_status,
    'reasons', v_reasons,
    'critical_count', v_critical_count,
    'high_count', v_high_count,
    'active_api_keys', v_active_keys,
    'stale_api_keys', v_stale_keys,
    'last_backup_at', v_bh.last_backup_at,
    'last_restore_test_at', v_bh.last_restore_test_at,
    'computed_at', now()
  );
END;
$$;

-- =========================================================
-- 5. record_security_release_check
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_security_release_check(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_id uuid;
BEGIN
  -- Permission: caller must be org admin or system admin
  IF NOT (user_org_role(p_org_id) = 'admin' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_result := public.compute_security_score(p_org_id);

  INSERT INTO public.security_release_checks (org_id, score, status, reasons, checked_by)
  VALUES (
    p_org_id,
    (v_result->>'score')::integer,
    v_result->>'status',
    COALESCE(v_result->'reasons', '[]'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_result || jsonb_build_object('check_id', v_id);
END;
$$;
