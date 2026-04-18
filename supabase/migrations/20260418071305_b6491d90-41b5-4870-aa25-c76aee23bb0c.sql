-- Track plugin download failures for fleet-wide visibility
CREATE TABLE public.plugin_download_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  user_id UUID,
  failure_stage TEXT NOT NULL, -- 'fetch' | 'http_error' | 'blob' | 'browser_trigger' | 'unknown'
  error_message TEXT,
  http_status INTEGER,
  download_url TEXT,
  user_agent TEXT,
  surface TEXT, -- 'settings' | 'onboarding'
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_download_failures_created_at ON public.plugin_download_failures(created_at DESC);
CREATE INDEX idx_plugin_download_failures_org_id ON public.plugin_download_failures(org_id);

ALTER TABLE public.plugin_download_failures ENABLE ROW LEVEL SECURITY;

-- Only admins can view failures (fleet-wide visibility)
CREATE POLICY "Admins can view all download failures"
ON public.plugin_download_failures
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Org members can view their own org's failures
CREATE POLICY "Org members can view their org failures"
ON public.plugin_download_failures
FOR SELECT
TO authenticated
USING (org_id IS NOT NULL AND public.is_org_member(org_id));

-- Inserts happen exclusively via the edge function (service role)
-- No INSERT policy needed for authenticated role
