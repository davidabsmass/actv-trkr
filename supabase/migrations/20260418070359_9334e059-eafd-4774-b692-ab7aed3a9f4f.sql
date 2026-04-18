-- PR 6: Plugin fleet health telemetry
CREATE TABLE IF NOT EXISTS public.plugin_health_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  plugin_version TEXT,
  mode TEXT NOT NULL DEFAULT 'unknown',
  forced_safe_mode BOOLEAN NOT NULL DEFAULT false,
  boot_failure_count INTEGER NOT NULL DEFAULT 0,
  in_boot_loop BOOLEAN NOT NULL DEFAULT false,
  migration_version INTEGER,
  migration_lock_held BOOLEAN NOT NULL DEFAULT false,
  disabled_modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  open_breakers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_error TEXT,
  blocked_versions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_healthy_version TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugin_health_reports_site_reported
  ON public.plugin_health_reports (site_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_health_reports_org_mode
  ON public.plugin_health_reports (org_id, mode, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_health_reports_domain_reported
  ON public.plugin_health_reports (domain, reported_at DESC);

ALTER TABLE public.plugin_health_reports ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can view reports for their orgs
CREATE POLICY "Org admins can view fleet health reports"
ON public.plugin_health_reports
FOR SELECT
TO authenticated
USING (
  org_id IS NOT NULL
  AND public.user_org_role(org_id) IN ('admin', 'owner')
);

-- System admins can view all
CREATE POLICY "System admins can view all fleet health reports"
ON public.plugin_health_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No public insert/update/delete; service role bypasses RLS for the intake edge function.
