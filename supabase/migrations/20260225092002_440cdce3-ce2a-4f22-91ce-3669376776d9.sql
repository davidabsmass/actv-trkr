
-- ================================================
-- MISSION METRICS SCHEMA V2 — Full Rebuild
-- ================================================

-- Drop old schema
DROP FUNCTION IF EXISTS public.validate_api_key(text);
DROP FUNCTION IF EXISTS public.upsert_session(uuid, uuid, text, text, timestamptz, text, text, text, text, text);
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.forecasts CASCADE;
DROP TABLE IF EXISTS public.kpi_daily CASCADE;
DROP TABLE IF EXISTS public.traffic_daily CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.pageviews CASCADE;
DROP TABLE IF EXISTS public.sources CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- 1. orgs
CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. org_users
CREATE TABLE public.org_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Helper functions
CREATE OR REPLACE FUNCTION public.user_org_role(_org_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.org_users WHERE user_id = auth.uid() AND org_id = _org_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_users WHERE user_id = auth.uid() AND org_id = _org_id);
$$;

-- 3. api_keys
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  label text NOT NULL DEFAULT 'Default',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL
);
CREATE INDEX idx_apikeys_hash ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

-- 4. sites
CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  type text NOT NULL DEFAULT 'wordpress',
  plugin_version text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, domain)
);

-- 5. forms
CREATE TABLE public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gravity_forms' CHECK (provider IN ('gravity_forms')),
  external_form_id text NOT NULL,
  name text NOT NULL DEFAULT 'Untitled Form',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, site_id, provider, external_form_id)
);

-- 6. lead_events_raw
CREATE TABLE public.lead_events_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  external_entry_id text NOT NULL,
  submitted_at timestamptz,
  payload jsonb,
  context jsonb,
  visitor_id text NULL,
  session_id text NULL,
  UNIQUE(org_id, site_id, form_id, external_entry_id)
);

-- 7. leads
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  page_url text, page_path text,
  referrer text, referrer_domain text,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  source text, medium text, campaign text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','booked','junk')),
  service text, location text, physician text, lead_type text, lead_score int,
  visitor_id text, session_id text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_org_time ON public.leads(org_id, submitted_at);
CREATE INDEX idx_leads_org_source ON public.leads(org_id, source, submitted_at);
CREATE INDEX idx_leads_org_campaign ON public.leads(org_id, campaign, submitted_at);
CREATE INDEX idx_leads_org_page ON public.leads(org_id, page_path, submitted_at);

-- 8. field_mappings
CREATE TABLE public.field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  external_field_id text NOT NULL,
  external_field_label text,
  field_type text,
  mapped_to text NOT NULL CHECK (mapped_to IN ('service','location','physician','lead_type','status','name','email','phone','message','ignore')),
  transform jsonb DEFAULT '{}'::jsonb,
  required boolean DEFAULT false,
  UNIQUE(org_id, form_id, external_field_id)
);

-- 9. lead_fields_flat
CREATE TABLE public.lead_fields_flat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text,
  field_type text,
  value_text text, value_number numeric, value_date date, value_bool boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lff_org_key ON public.lead_fields_flat(org_id, field_key);
CREATE INDEX idx_lff_org_text ON public.lead_fields_flat(org_id, value_text);

-- 10. pageviews
CREATE TABLE public.pageviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  event_id text NOT NULL,
  visitor_id text, session_id text,
  page_url text, page_path text, title text,
  referrer text, referrer_domain text,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  device text, ip_hash text, user_agent_hash text,
  UNIQUE(org_id, site_id, event_id)
);
CREATE INDEX idx_pv_org_time ON public.pageviews(org_id, occurred_at);
CREATE INDEX idx_pv_org_path ON public.pageviews(org_id, page_path, occurred_at);
CREATE INDEX idx_pv_org_session ON public.pageviews(org_id, session_id, occurred_at);

-- 11. sessions
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  visitor_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  landing_page_path text, landing_referrer_domain text,
  utm_source text, utm_medium text, utm_campaign text,
  UNIQUE(org_id, site_id, session_id)
);
CREATE INDEX idx_sess_org_time ON public.sessions(org_id, started_at);

-- 12. traffic_daily
CREATE TABLE public.traffic_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  date date NOT NULL, metric text NOT NULL, dimension text, value numeric NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_td_upsert ON public.traffic_daily(org_id, date, metric, COALESCE(dimension, '__null__'));
CREATE INDEX idx_td_lookup ON public.traffic_daily(org_id, metric, date);

-- 13. kpi_daily
CREATE TABLE public.kpi_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  date date NOT NULL, metric text NOT NULL, dimension text, value numeric NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_kd_upsert ON public.kpi_daily(org_id, date, metric, COALESCE(dimension, '__null__'));
CREATE INDEX idx_kd_lookup ON public.kpi_daily(org_id, metric, date);

-- 14. goals
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  month date NOT NULL, target_leads int NOT NULL,
  UNIQUE(org_id, month)
);

-- 15. saved_views
CREATE TABLE public.saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL, form_id uuid REFERENCES public.forms(id),
  filters jsonb DEFAULT '[]'::jsonb, columns jsonb DEFAULT '[]'::jsonb, sort jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 16. export_jobs
CREATE TABLE public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  saved_view_id uuid REFERENCES public.saved_views(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  format text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','xlsx','pdf')),
  row_count int, file_path text, error text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 17. report_templates
CREATE TABLE public.report_templates (
  slug text PRIMARY KEY,
  name text NOT NULL,
  default_params jsonb DEFAULT '{}'::jsonb
);

-- 18. report_runs
CREATE TABLE public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  template_slug text NOT NULL REFERENCES public.report_templates(slug),
  params jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  file_path text, error text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 19. report_schedules
CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  template_slug text NOT NULL REFERENCES public.report_templates(slug),
  params jsonb DEFAULT '{}'::jsonb,
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly')),
  run_at_local_time text NOT NULL DEFAULT '09:00',
  timezone text NOT NULL DEFAULT 'America/New_York',
  recipients jsonb DEFAULT '[]'::jsonb,
  format text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','xlsx','csv')),
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz, next_run_at timestamptz
);

-- 20. alerts
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  date date NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  title text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_org ON public.alerts(org_id, date DESC);

-- 21. url_rules
CREATE TABLE public.url_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('contains','starts_with','regex')),
  pattern text NOT NULL,
  maps_to text NOT NULL CHECK (maps_to IN ('service','location','physician')),
  value text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========== RLS ==========
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_fields_flat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.url_rules ENABLE ROW LEVEL SECURITY;

-- orgs: members can read
CREATE POLICY "org_select" ON public.orgs FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "org_insert" ON public.orgs FOR INSERT WITH CHECK (true);
CREATE POLICY "org_update" ON public.orgs FOR UPDATE USING (public.user_org_role(id) = 'admin');

-- org_users: members read, admin write
CREATE POLICY "ou_select" ON public.org_users FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "ou_insert" ON public.org_users FOR INSERT WITH CHECK (
  public.user_org_role(org_id) = 'admin' OR NOT EXISTS (SELECT 1 FROM public.org_users WHERE org_id = org_users.org_id)
);
CREATE POLICY "ou_update" ON public.org_users FOR UPDATE USING (public.user_org_role(org_id) = 'admin');
CREATE POLICY "ou_delete" ON public.org_users FOR DELETE USING (public.user_org_role(org_id) = 'admin');

-- api_keys: admin only
CREATE POLICY "ak_select" ON public.api_keys FOR SELECT USING (public.user_org_role(org_id) = 'admin');
CREATE POLICY "ak_insert" ON public.api_keys FOR INSERT WITH CHECK (public.user_org_role(org_id) = 'admin');
CREATE POLICY "ak_update" ON public.api_keys FOR UPDATE USING (public.user_org_role(org_id) = 'admin');

-- Standard org member policies (read for all members, write for admin+member)
CREATE POLICY "sites_select" ON public.sites FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "sites_write" ON public.sites FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "forms_select" ON public.forms FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "forms_write" ON public.forms FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "ler_select" ON public.lead_events_raw FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "fm_select" ON public.field_mappings FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "fm_write" ON public.field_mappings FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));
CREATE POLICY "fm_update" ON public.field_mappings FOR UPDATE USING (public.user_org_role(org_id) IN ('admin','member'));
CREATE POLICY "fm_delete" ON public.field_mappings FOR DELETE USING (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "lff_select" ON public.lead_fields_flat FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "pv_select" ON public.pageviews FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "sess_select" ON public.sessions FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "td_select" ON public.traffic_daily FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "kd_select" ON public.kpi_daily FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "goals_select" ON public.goals FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "goals_write" ON public.goals FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));
CREATE POLICY "goals_update" ON public.goals FOR UPDATE USING (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "sv_select" ON public.saved_views FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "sv_write" ON public.saved_views FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));
CREATE POLICY "sv_delete" ON public.saved_views FOR DELETE USING (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "ej_select" ON public.export_jobs FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "ej_write" ON public.export_jobs FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "rt_select" ON public.report_templates FOR SELECT USING (true);

CREATE POLICY "rr_select" ON public.report_runs FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "rr_write" ON public.report_runs FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));

CREATE POLICY "rs_select" ON public.report_schedules FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "rs_write" ON public.report_schedules FOR INSERT WITH CHECK (public.user_org_role(org_id) = 'admin');
CREATE POLICY "rs_update" ON public.report_schedules FOR UPDATE USING (public.user_org_role(org_id) = 'admin');
CREATE POLICY "rs_delete" ON public.report_schedules FOR DELETE USING (public.user_org_role(org_id) = 'admin');

CREATE POLICY "alerts_select" ON public.alerts FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "ur_select" ON public.url_rules FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "ur_write" ON public.url_rules FOR INSERT WITH CHECK (public.user_org_role(org_id) IN ('admin','member'));
CREATE POLICY "ur_update" ON public.url_rules FOR UPDATE USING (public.user_org_role(org_id) IN ('admin','member'));
CREATE POLICY "ur_delete" ON public.url_rules FOR DELETE USING (public.user_org_role(org_id) IN ('admin','member'));

-- ========== UPSERT SESSION ==========
CREATE OR REPLACE FUNCTION public.upsert_session(
  p_org_id uuid, p_site_id uuid, p_session_id text, p_visitor_id text,
  p_occurred_at timestamptz, p_page_path text, p_referrer_domain text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sessions (
    org_id, site_id, session_id, visitor_id,
    started_at, ended_at, landing_page_path, landing_referrer_domain,
    utm_source, utm_medium, utm_campaign
  ) VALUES (
    p_org_id, p_site_id, p_session_id, p_visitor_id,
    p_occurred_at, p_occurred_at, p_page_path, p_referrer_domain,
    p_utm_source, p_utm_medium, p_utm_campaign
  ) ON CONFLICT (org_id, site_id, session_id) DO UPDATE SET
    ended_at = GREATEST(sessions.ended_at, EXCLUDED.ended_at);
END;
$$;

-- ========== SEED REPORT TEMPLATES ==========
INSERT INTO public.report_templates (slug, name, default_params) VALUES
  ('weekly_brief', 'Weekly Brief', '{"period_days": 7}'),
  ('monthly_performance', 'Monthly Performance Report', '{"period_days": 30}'),
  ('campaign_report', 'Campaign Report', '{"period_days": 30}');

-- ========== STORAGE BUCKETS ==========
INSERT INTO storage.buckets (id, name, public) VALUES ('exports', 'exports', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

CREATE POLICY "Org members can read exports" ON storage.objects FOR SELECT
  USING (bucket_id = 'exports');
CREATE POLICY "Org members can read reports" ON storage.objects FOR SELECT
  USING (bucket_id = 'reports');
