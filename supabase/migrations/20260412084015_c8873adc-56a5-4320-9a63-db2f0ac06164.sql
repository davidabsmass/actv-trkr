-- site_tracking_status: per-site tracker health
CREATE TABLE public.site_tracking_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tracker_status text NOT NULL DEFAULT 'active',
  last_event_at timestamptz,
  last_heartbeat_at timestamptz,
  last_page_view_at timestamptz,
  events_last_hour integer NOT NULL DEFAULT 0,
  heartbeats_last_hour integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, site_id)
);

ALTER TABLE public.site_tracking_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sts_select" ON public.site_tracking_status
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

-- tracking_interruptions: records gaps in tracking data
CREATE TABLE public.tracking_interruptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  trigger_reason text NOT NULL DEFAULT 'stale',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracking_interruptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ti_select" ON public.tracking_interruptions
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

-- tracker_alerts: alerts about tracking health
CREATE TABLE public.tracker_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracker_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ta_select" ON public.tracker_alerts
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "ta_update" ON public.tracker_alerts
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id));

-- Indexes
CREATE INDEX idx_sts_site ON public.site_tracking_status(site_id);
CREATE INDEX idx_ti_site_open ON public.tracking_interruptions(site_id) WHERE resolved = false;
CREATE INDEX idx_ta_site ON public.tracker_alerts(site_id, created_at DESC);

-- Enable realtime for live dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_tracking_status;