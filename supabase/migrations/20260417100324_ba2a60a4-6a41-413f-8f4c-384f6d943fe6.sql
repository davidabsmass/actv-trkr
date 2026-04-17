
-- Phase 2: Forecasting + Technology/IP/Dependency tables

CREATE TABLE public.forecast_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text NOT NULL,
  scenario text NOT NULL DEFAULT 'base',
  metric_key text NOT NULL,
  forecast_value numeric,
  actual_value numeric,
  notes text,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.technology_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  name text NOT NULL,
  description text,
  criticality text NOT NULL DEFAULT 'medium',
  replaceable text NOT NULL DEFAULT 'medium',
  monthly_cost numeric,
  owner_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ip_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL,
  asset_name text NOT NULL,
  owner_name text,
  assignment_status text NOT NULL DEFAULT 'missing',
  document_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.founder_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_name text NOT NULL,
  category text NOT NULL,
  dependency_level text NOT NULL DEFAULT 'high',
  documentation_status text NOT NULL DEFAULT 'missing',
  runbook_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technology_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage forecast_assumptions" ON public.forecast_assumptions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage technology_dependencies" ON public.technology_dependencies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ip_assignments" ON public.ip_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage founder_dependencies" ON public.founder_dependencies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_forecast_assumptions_uat BEFORE UPDATE ON public.forecast_assumptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_technology_dependencies_uat BEFORE UPDATE ON public.technology_dependencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ip_assignments_uat BEFORE UPDATE ON public.ip_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_founder_dependencies_uat BEFORE UPDATE ON public.founder_dependencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed reconciliation rows for the canonical financial metrics
INSERT INTO public.reconciliation_status (metric_key, status, notes)
VALUES
  ('arr','pending','Reconcile ARR vs Stripe MRR snapshot'),
  ('mrr','pending','Reconcile MRR vs Stripe billing'),
  ('bookings','pending','Reconcile bookings vs signed contracts'),
  ('billings','pending','Reconcile invoices issued vs revenue'),
  ('collections','pending','Reconcile cash collected vs Stripe payouts'),
  ('refunds','pending','Reconcile refund log vs Stripe refunds'),
  ('deferred_revenue','pending','Roll-forward deferred revenue balance')
ON CONFLICT DO NOTHING;

-- Seed starter vendor registry
INSERT INTO public.vendor_risk_registry (vendor_name, category, criticality, risk_level, dependency_notes)
VALUES
  ('Supabase','infrastructure','critical','medium','Database, auth, edge functions, storage'),
  ('Stripe','billing','critical','low','Subscription billing and payments'),
  ('Lovable AI Gateway','ai','high','low','AI insights, chatbot, summaries'),
  ('Resend','communications','high','low','Transactional + marketing email'),
  ('Cloudflare','infrastructure','medium','low','DNS, CDN, edge protection')
ON CONFLICT DO NOTHING;

-- Seed operational documents checklist
INSERT INTO public.operational_documents (document_type, title, status)
VALUES
  ('legal','Privacy Policy','ready'),
  ('legal','Terms of Service','ready'),
  ('legal','Data Processing Agreement (DPA)','ready'),
  ('legal','Subprocessor List','partial'),
  ('security','Information Security Policy','missing'),
  ('security','Incident Response Plan','missing'),
  ('security','Backup & Restore Runbook','missing'),
  ('security','Disaster Recovery Plan','missing'),
  ('ops','Employee Handbook','missing'),
  ('ops','SOP Library','partial'),
  ('finance','Cap Table','missing'),
  ('finance','Most Recent Audit / Review','missing')
ON CONFLICT DO NOTHING;

-- Seed founder/key-person dependencies starter
INSERT INTO public.founder_dependencies (process_name, category, dependency_level, documentation_status)
VALUES
  ('Production database access','infrastructure','high','missing'),
  ('Stripe account ownership','billing','high','missing'),
  ('Domain & DNS management','infrastructure','high','missing'),
  ('Customer onboarding','operations','medium','partial'),
  ('Plugin release process','engineering','high','partial'),
  ('Support escalation handling','support','medium','missing')
ON CONFLICT DO NOTHING;

-- Seed technology dependencies starter
INSERT INTO public.technology_dependencies (category, name, description, criticality, replaceable)
VALUES
  ('hosting','Lovable / Supabase','Application hosting and backend','critical','low'),
  ('database','Postgres (Supabase)','Primary datastore','critical','low'),
  ('auth','Supabase Auth','User authentication','critical','medium'),
  ('billing','Stripe','Subscription management','critical','low'),
  ('ai','Lovable AI Gateway','LLM access','high','medium'),
  ('email','Resend','Transactional email','high','high'),
  ('cdn','Cloudflare','DNS, edge caching','medium','high')
ON CONFLICT DO NOTHING;
