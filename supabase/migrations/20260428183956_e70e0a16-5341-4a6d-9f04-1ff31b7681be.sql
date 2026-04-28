-- Defensive cleanup of any stray constraint from a prior failed run
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_scope_check') THEN
    EXECUTE 'ALTER TABLE IF EXISTS public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_scope_check';
  END IF;
END $$;

-- ── 1. feature_flags ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flag_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global','org','site')),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_scope_shape CHECK (
    (scope = 'global' AND org_id IS NULL AND site_id IS NULL) OR
    (scope = 'org'    AND org_id IS NOT NULL AND site_id IS NULL) OR
    (scope = 'site'   AND org_id IS NOT NULL AND site_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_global_uniq
  ON public.feature_flags(flag_key) WHERE scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_org_uniq
  ON public.feature_flags(flag_key, org_id) WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_site_uniq
  ON public.feature_flags(flag_key, site_id) WHERE scope = 'site';
CREATE INDEX IF NOT EXISTS feature_flags_org_idx ON public.feature_flags(org_id);
CREATE INDEX IF NOT EXISTS feature_flags_site_idx ON public.feature_flags(site_id);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags: org members can read scoped flags" ON public.feature_flags;
CREATE POLICY "feature_flags: org members can read scoped flags"
  ON public.feature_flags FOR SELECT TO authenticated
  USING (
    scope = 'global'
    OR (org_id IS NOT NULL AND public.is_org_member(org_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "feature_flags: org admins can insert" ON public.feature_flags;
CREATE POLICY "feature_flags: org admins can insert"
  ON public.feature_flags FOR INSERT TO authenticated
  WITH CHECK (
    (scope <> 'global' AND org_id IS NOT NULL AND public.is_org_admin(auth.uid(), org_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "feature_flags: org admins can update" ON public.feature_flags;
CREATE POLICY "feature_flags: org admins can update"
  ON public.feature_flags FOR UPDATE TO authenticated
  USING (
    (scope <> 'global' AND org_id IS NOT NULL AND public.is_org_admin(auth.uid(), org_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "feature_flags: org admins can delete" ON public.feature_flags;
CREATE POLICY "feature_flags: org admins can delete"
  ON public.feature_flags FOR DELETE TO authenticated
  USING (
    (scope <> 'global' AND org_id IS NOT NULL AND public.is_org_admin(auth.uid(), org_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP TRIGGER IF EXISTS feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 2. rate_limit_log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  bucket_type TEXT NOT NULL,
  bucket_key TEXT,
  observed_count INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER,
  would_block BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_log_org_time_idx ON public.rate_limit_log(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_log_site_time_idx ON public.rate_limit_log(site_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_log_endpoint_idx ON public.rate_limit_log(endpoint, occurred_at DESC);

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_log: org members can read" ON public.rate_limit_log;
CREATE POLICY "rate_limit_log: org members can read"
  ON public.rate_limit_log FOR SELECT TO authenticated
  USING (
    (org_id IS NOT NULL AND public.is_org_member(org_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ── 3. domain_allowlist ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.domain_allowlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_allowlist_site_domain_uniq
  ON public.domain_allowlist(site_id, lower(domain));
CREATE INDEX IF NOT EXISTS domain_allowlist_org_idx ON public.domain_allowlist(org_id);

ALTER TABLE public.domain_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_allowlist: org members read" ON public.domain_allowlist;
CREATE POLICY "domain_allowlist: org members read"
  ON public.domain_allowlist FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "domain_allowlist: org admins insert" ON public.domain_allowlist;
CREATE POLICY "domain_allowlist: org admins insert"
  ON public.domain_allowlist FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "domain_allowlist: org admins update" ON public.domain_allowlist;
CREATE POLICY "domain_allowlist: org admins update"
  ON public.domain_allowlist FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "domain_allowlist: org admins delete" ON public.domain_allowlist;
CREATE POLICY "domain_allowlist: org admins delete"
  ON public.domain_allowlist FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS domain_allowlist_updated_at ON public.domain_allowlist;
CREATE TRIGGER domain_allowlist_updated_at
  BEFORE UPDATE ON public.domain_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. tracking_health ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracking_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status TEXT,
  total_events BIGINT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_health_uniq
  ON public.tracking_health(org_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), endpoint);
CREATE INDEX IF NOT EXISTS tracking_health_site_idx ON public.tracking_health(site_id);
CREATE INDEX IF NOT EXISTS tracking_health_last_event_idx ON public.tracking_health(last_event_at DESC);

ALTER TABLE public.tracking_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_health: org members read" ON public.tracking_health;
CREATE POLICY "tracking_health: org members read"
  ON public.tracking_health FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── 5. system_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_events (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  source TEXT,
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_events_org_time_idx ON public.system_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS system_events_type_idx ON public.system_events(event_type, occurred_at DESC);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_events: org members read scoped" ON public.system_events;
CREATE POLICY "system_events: org members read scoped"
  ON public.system_events FOR SELECT TO authenticated
  USING (
    (org_id IS NOT NULL AND public.is_org_member(org_id))
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- ── 6. feature_enabled ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.feature_enabled(
  p_flag_key TEXT,
  p_org_id UUID DEFAULT NULL,
  p_site_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.feature_flags
       WHERE flag_key = p_flag_key AND scope = 'site' AND site_id = p_site_id LIMIT 1),
    (SELECT enabled FROM public.feature_flags
       WHERE flag_key = p_flag_key AND scope = 'org' AND org_id = p_org_id LIMIT 1),
    (SELECT enabled FROM public.feature_flags
       WHERE flag_key = p_flag_key AND scope = 'global' LIMIT 1),
    false
  );
$$;

-- ── 7. touch_tracking_health ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_tracking_health(
  p_org_id UUID,
  p_site_id UUID,
  p_endpoint TEXT,
  p_status TEXT DEFAULT 'ok'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tracking_health (org_id, site_id, endpoint, last_event_at, last_status, total_events, updated_at)
  VALUES (p_org_id, p_site_id, p_endpoint, now(), p_status, 1, now())
  ON CONFLICT (org_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), endpoint)
  DO UPDATE SET
    last_event_at = now(),
    last_status = EXCLUDED.last_status,
    total_events = public.tracking_health.total_events + 1,
    updated_at = now();
END;
$$;

-- ── 8. log_rate_limit_observation ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_rate_limit_observation(
  p_org_id UUID,
  p_site_id UUID,
  p_endpoint TEXT,
  p_bucket_type TEXT,
  p_bucket_key TEXT,
  p_observed_count INTEGER,
  p_threshold INTEGER,
  p_would_block BOOLEAN,
  p_details JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.rate_limit_log
    (org_id, site_id, endpoint, bucket_type, bucket_key, observed_count, threshold, would_block, details)
  VALUES
    (p_org_id, p_site_id, p_endpoint, p_bucket_type, p_bucket_key, p_observed_count, p_threshold, p_would_block, p_details);
$$;