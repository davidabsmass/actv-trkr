
-- Extend sites table with monitoring columns
ALTER TABLE public.sites 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'UP',
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_interval_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS down_after_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS url text;

-- Site heartbeats
CREATE TABLE public.site_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'js',
  meta jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.site_heartbeats ENABLE ROW LEVEL SECURITY;

-- Incidents
CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'warning',
  details jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- Monitoring alerts (separate from existing alerts table)
CREATE TABLE public.monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  subject text NOT NULL,
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  error text
);
ALTER TABLE public.monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- Broken links
CREATE TABLE public.broken_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  source_page text NOT NULL,
  broken_url text NOT NULL,
  status_code integer,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1
);
ALTER TABLE public.broken_links ENABLE ROW LEVEL SECURITY;

-- Domain health
CREATE TABLE public.domain_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  domain_expiry_date date,
  days_to_domain_expiry integer,
  source text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id)
);
ALTER TABLE public.domain_health ENABLE ROW LEVEL SECURITY;

-- SSL health
CREATE TABLE public.ssl_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ssl_expiry_date date,
  days_to_ssl_expiry integer,
  issuer text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id)
);
ALTER TABLE public.ssl_health ENABLE ROW LEVEL SECURITY;

-- Renewals
CREATE TABLE public.renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'hosting',
  provider_name text,
  renewal_date date,
  auto_renew boolean NOT NULL DEFAULT false,
  notes text,
  notify_emails jsonb DEFAULT '[]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;

-- Site notification rules
CREATE TABLE public.site_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  is_enabled boolean NOT NULL DEFAULT false,
  threshold_json jsonb,
  UNIQUE(site_id, alert_type, channel)
);
ALTER TABLE public.site_notification_rules ENABLE ROW LEVEL SECURITY;

-- User notification preferences
CREATE TABLE public.user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  is_enabled boolean NOT NULL DEFAULT true,
  phone text,
  UNIQUE(user_id, channel)
);
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- User site subscriptions
CREATE TABLE public.user_site_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  is_enabled boolean NOT NULL DEFAULT true,
  UNIQUE(user_id, site_id, alert_type, channel)
);
ALTER TABLE public.user_site_subscriptions ENABLE ROW LEVEL SECURITY;

-- In-app notifications inbox
CREATE TABLE public.notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.monitoring_alerts(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_inbox ENABLE ROW LEVEL SECURITY;

-- Form submission logs
CREATE TABLE public.form_submission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'success',
  page_url text,
  error_message text,
  meta jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.form_submission_logs ENABLE ROW LEVEL SECURITY;

-- Conversions daily
CREATE TABLE public.conversions_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  day date NOT NULL,
  page_url text,
  form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL,
  submissions integer NOT NULL DEFAULT 0,
  pageviews integer NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  UNIQUE(site_id, day, page_url, form_id)
);
ALTER TABLE public.conversions_daily ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- site_heartbeats
CREATE POLICY "sh_select" ON public.site_heartbeats FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND is_org_member(s.org_id))
);

-- incidents
CREATE POLICY "inc_select" ON public.incidents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "inc_insert" ON public.incidents FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY "inc_update" ON public.incidents FOR UPDATE USING (is_org_member(org_id));

-- monitoring_alerts
CREATE POLICY "ma2_select" ON public.monitoring_alerts FOR SELECT USING (is_org_member(org_id));

-- broken_links
CREATE POLICY "bl_select" ON public.broken_links FOR SELECT USING (is_org_member(org_id));

-- domain_health
CREATE POLICY "dh_select" ON public.domain_health FOR SELECT USING (is_org_member(org_id));

-- ssl_health
CREATE POLICY "slh_select" ON public.ssl_health FOR SELECT USING (is_org_member(org_id));

-- renewals
CREATE POLICY "ren_select" ON public.renewals FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "ren_insert" ON public.renewals FOR INSERT WITH CHECK (
  user_org_role(org_id) = ANY (ARRAY['admin', 'member'])
);
CREATE POLICY "ren_update" ON public.renewals FOR UPDATE USING (
  user_org_role(org_id) = ANY (ARRAY['admin', 'member'])
);
CREATE POLICY "ren_delete" ON public.renewals FOR DELETE USING (
  user_org_role(org_id) = ANY (ARRAY['admin', 'member'])
);

-- site_notification_rules
CREATE POLICY "snr_select" ON public.site_notification_rules FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "snr_insert" ON public.site_notification_rules FOR INSERT WITH CHECK (
  user_org_role(org_id) = ANY (ARRAY['admin', 'member'])
);
CREATE POLICY "snr_update" ON public.site_notification_rules FOR UPDATE USING (
  user_org_role(org_id) = ANY (ARRAY['admin', 'member'])
);
CREATE POLICY "snr_delete" ON public.site_notification_rules FOR DELETE USING (
  user_org_role(org_id) = ANY (ARRAY['admin', 'member'])
);

-- user_notification_preferences
CREATE POLICY "unp_select" ON public.user_notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "unp_insert" ON public.user_notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unp_update" ON public.user_notification_preferences FOR UPDATE USING (auth.uid() = user_id);

-- user_site_subscriptions
CREATE POLICY "uss_select" ON public.user_site_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "uss_insert" ON public.user_site_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uss_update" ON public.user_site_subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- notification_inbox
CREATE POLICY "ni_select" ON public.notification_inbox FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ni_update" ON public.notification_inbox FOR UPDATE USING (auth.uid() = user_id);

-- form_submission_logs
CREATE POLICY "fsl_select" ON public.form_submission_logs FOR SELECT USING (is_org_member(org_id));

-- conversions_daily
CREATE POLICY "cd_select" ON public.conversions_daily FOR SELECT USING (is_org_member(org_id));

-- Indexes
CREATE INDEX idx_heartbeats_site_received ON public.site_heartbeats(site_id, received_at DESC);
CREATE INDEX idx_incidents_site_type ON public.incidents(site_id, type, resolved_at);
CREATE INDEX idx_monitoring_alerts_status ON public.monitoring_alerts(status, created_at);
CREATE INDEX idx_broken_links_site ON public.broken_links(site_id, last_seen_at DESC);
CREATE INDEX idx_notification_inbox_user ON public.notification_inbox(user_id, is_read, created_at DESC);
CREATE INDEX idx_form_submission_logs_site ON public.form_submission_logs(site_id, occurred_at DESC);
CREATE INDEX idx_conversions_daily_site ON public.conversions_daily(site_id, day DESC);
