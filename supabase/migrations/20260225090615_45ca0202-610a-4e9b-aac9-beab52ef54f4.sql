
-- ============================================================
-- MISSION CONTROL ANALYTICS SCHEMA
-- ============================================================

-- 1. CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'America/New_York',
  api_key text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX idx_clients_api_key ON public.clients(api_key);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE USING (auth.uid() = owner_id);

-- 2. SOURCES
CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  domain text NOT NULL,
  site_id text,
  source_type text NOT NULL DEFAULT 'wordpress',
  plugin_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, domain)
);
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view sources via client" ON public.sources FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = sources.client_id AND owner_id = auth.uid()));
CREATE POLICY "Users can insert sources via client" ON public.sources FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE id = sources.client_id AND owner_id = auth.uid()));

-- 3. PAGEVIEWS
CREATE TABLE public.pageviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.sources(id),
  occurred_at timestamptz NOT NULL,
  event_id text,
  visitor_id text,
  session_id text,
  page_url text,
  page_path text,
  title text,
  referrer text,
  referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  device text,
  ip_hash text,
  user_agent_hash text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pageviews_idempotent ON public.pageviews(client_id, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_pageviews_client_time ON public.pageviews(client_id, occurred_at);
CREATE INDEX idx_pageviews_client_path ON public.pageviews(client_id, page_path, occurred_at);
CREATE INDEX idx_pageviews_client_session ON public.pageviews(client_id, session_id, occurred_at);
CREATE INDEX idx_pageviews_client_source ON public.pageviews(client_id, utm_source, occurred_at);
ALTER TABLE public.pageviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view pageviews via client" ON public.pageviews FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = pageviews.client_id AND owner_id = auth.uid()));

-- 4. SESSIONS
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.sources(id),
  session_id text NOT NULL,
  visitor_id text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  landing_page_path text,
  landing_referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  pageview_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, session_id)
);
CREATE INDEX idx_sessions_client_time ON public.sessions(client_id, started_at);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view sessions via client" ON public.sessions FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = sessions.client_id AND owner_id = auth.uid()));

-- 5. LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.sources(id),
  form_id text,
  form_title text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  page_url text,
  page_path text,
  session_id text,
  visitor_id text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  fields jsonb DEFAULT '[]'::jsonb,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_client_time ON public.leads(client_id, submitted_at);
CREATE INDEX idx_leads_client_source ON public.leads(client_id, utm_source, submitted_at);
CREATE INDEX idx_leads_client_page ON public.leads(client_id, page_path, submitted_at);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view leads via client" ON public.leads FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = leads.client_id AND owner_id = auth.uid()));

-- 6. TRAFFIC_DAILY (use unique index instead of composite PK with COALESCE)
CREATE TABLE public.traffic_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  metric text NOT NULL,
  dimension text,
  value numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_traffic_daily_upsert ON public.traffic_daily(client_id, date, metric, COALESCE(dimension, '__null__'));
CREATE INDEX idx_traffic_daily_lookup ON public.traffic_daily(client_id, metric, date);
ALTER TABLE public.traffic_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view traffic_daily via client" ON public.traffic_daily FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = traffic_daily.client_id AND owner_id = auth.uid()));

-- 7. KPI_DAILY
CREATE TABLE public.kpi_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  metric text NOT NULL,
  dimension text,
  value numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_kpi_daily_upsert ON public.kpi_daily(client_id, date, metric, COALESCE(dimension, '__null__'));
CREATE INDEX idx_kpi_daily_lookup ON public.kpi_daily(client_id, metric, date);
ALTER TABLE public.kpi_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view kpi_daily via client" ON public.kpi_daily FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = kpi_daily.client_id AND owner_id = auth.uid()));

-- 8. FORECASTS
CREATE TABLE public.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  metric text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  horizon_days int NOT NULL DEFAULT 30,
  start_date date NOT NULL,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_info jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX idx_forecasts_client ON public.forecasts(client_id, metric, run_at DESC);
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view forecasts via client" ON public.forecasts FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = forecasts.client_id AND owner_id = auth.uid()));

-- 9. ALERTS
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_client ON public.alerts(client_id, date DESC);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view alerts via client" ON public.alerts FOR SELECT USING (EXISTS (SELECT 1 FROM public.clients WHERE id = alerts.client_id AND owner_id = auth.uid()));
CREATE POLICY "Users can update alerts via client" ON public.alerts FOR UPDATE USING (EXISTS (SELECT 1 FROM public.clients WHERE id = alerts.client_id AND owner_id = auth.uid()));

-- 10. PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- API key validation function (for edge functions)
CREATE OR REPLACE FUNCTION public.validate_api_key(key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clients WHERE api_key = key LIMIT 1;
$$;

-- Session upsert function (for edge functions)
CREATE OR REPLACE FUNCTION public.upsert_session(
  p_client_id uuid, p_source_id uuid, p_session_id text, p_visitor_id text,
  p_occurred_at timestamptz, p_page_path text, p_referrer_domain text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sessions (
    client_id, source_id, session_id, visitor_id,
    started_at, ended_at, landing_page_path, landing_referrer_domain,
    utm_source, utm_medium, utm_campaign, pageview_count
  ) VALUES (
    p_client_id, p_source_id, p_session_id, p_visitor_id,
    p_occurred_at, p_occurred_at, p_page_path, p_referrer_domain,
    p_utm_source, p_utm_medium, p_utm_campaign, 1
  )
  ON CONFLICT (client_id, session_id) DO UPDATE SET
    ended_at = GREATEST(sessions.ended_at, EXCLUDED.ended_at),
    pageview_count = sessions.pageview_count + 1;
END;
$$;
