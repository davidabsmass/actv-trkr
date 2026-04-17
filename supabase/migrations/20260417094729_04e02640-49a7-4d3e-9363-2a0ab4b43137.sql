
-- ============================================================================
-- ACQUISITION READINESS SCHEMA (Phase 1)
-- ============================================================================

-- A) acquisition_metric_snapshots
CREATE TABLE public.acquisition_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  metric_name text NOT NULL,
  metric_value numeric,
  metric_date date NOT NULL,
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  segment text NULL,
  plan text NULL,
  customer_id uuid NULL,
  site_id uuid NULL,
  source_system text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_acq_metric_snapshots_key_date ON public.acquisition_metric_snapshots(metric_key, metric_date DESC);
CREATE INDEX idx_acq_metric_snapshots_org ON public.acquisition_metric_snapshots(org_id) WHERE org_id IS NOT NULL;
ALTER TABLE public.acquisition_metric_snapshots ENABLE ROW LEVEL SECURITY;

-- B) acquisition_risk_flags
CREATE TABLE public.acquisition_risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  owner_user_id uuid NULL,
  linked_customer_id uuid NULL,
  linked_org_id uuid NULL REFERENCES public.orgs(id) ON DELETE SET NULL,
  linked_site_id uuid NULL,
  linked_vendor_id uuid NULL,
  linked_ticket_id uuid NULL,
  mitigation_plan text,
  due_date date NULL,
  resolved_at timestamptz NULL,
  auto_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_acq_risks_status ON public.acquisition_risk_flags(status, severity);
CREATE INDEX idx_acq_risks_type ON public.acquisition_risk_flags(risk_type);
ALTER TABLE public.acquisition_risk_flags ENABLE ROW LEVEL SECURITY;

-- C) acquisition_contract_flags
CREATE TABLE public.acquisition_contract_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  contract_id uuid NULL,
  flag_type text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contract_flags_customer ON public.acquisition_contract_flags(customer_id);
ALTER TABLE public.acquisition_contract_flags ENABLE ROW LEVEL SECURITY;

-- D) metric_definitions
CREATE TABLE public.metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text UNIQUE NOT NULL,
  metric_name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  formula text,
  description text,
  source_systems text,
  owner_user_id uuid NULL,
  caveats text,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;

-- E) reconciliation_status
CREATE TABLE public.reconciliation_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  period_start date NULL,
  period_end date NULL,
  status text NOT NULL DEFAULT 'pending',
  discrepancy_amount numeric NULL,
  notes text,
  owner_user_id uuid NULL,
  last_reconciled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reconciliation_metric ON public.reconciliation_status(metric_key, period_end DESC);
ALTER TABLE public.reconciliation_status ENABLE ROW LEVEL SECURITY;

-- F) diligence_checklist_items
CREATE TABLE public.diligence_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL,
  item_name text NOT NULL,
  readiness_status text NOT NULL DEFAULT 'missing',
  notes text,
  linked_document_url text NULL,
  owner_user_id uuid NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_diligence_section ON public.diligence_checklist_items(section_key, sort_order);
ALTER TABLE public.diligence_checklist_items ENABLE ROW LEVEL SECURITY;

-- G) vendor_risk_registry
CREATE TABLE public.vendor_risk_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL,
  category text NULL,
  criticality text NULL DEFAULT 'medium',
  dependency_notes text,
  contract_status text NULL,
  risk_level text NULL DEFAULT 'medium',
  backup_plan text,
  monthly_cost numeric NULL,
  contract_renewal_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_risk_registry ENABLE ROW LEVEL SECURITY;

-- H) customer_health_snapshots
CREATE TABLE public.customer_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  arr numeric NULL,
  health_score numeric NULL,
  usage_score numeric NULL,
  support_score numeric NULL,
  renewal_risk text NULL,
  expansion_potential text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_health_date ON public.customer_health_snapshots(snapshot_date DESC);
CREATE INDEX idx_customer_health_customer ON public.customer_health_snapshots(customer_id, snapshot_date DESC);
ALTER TABLE public.customer_health_snapshots ENABLE ROW LEVEL SECURITY;

-- I) security_incidents
CREATE TABLE public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  identified_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  summary text,
  remediation_notes text,
  owner_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

-- J) operational_documents
CREATE TABLE public.operational_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'missing',
  linked_url text NULL,
  notes text,
  owner_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.operational_documents ENABLE ROW LEVEL SECURITY;

-- K) finance_monthly (manual finance entries for margin/burn/runway)
CREATE TABLE public.finance_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,
  revenue numeric DEFAULT 0,
  cogs_hosting numeric DEFAULT 0,
  cogs_ai numeric DEFAULT 0,
  cogs_support numeric DEFAULT 0,
  cogs_other numeric DEFAULT 0,
  opex_rd numeric DEFAULT 0,
  opex_sm numeric DEFAULT 0,
  opex_ga numeric DEFAULT 0,
  cash_balance numeric NULL,
  headcount integer DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_monthly ENABLE ROW LEVEL SECURITY;

-- L) customer_contracts (contract register)
CREATE TABLE public.customer_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  plan text NULL,
  acv numeric DEFAULT 0,
  mrr numeric DEFAULT 0,
  contract_start date NULL,
  contract_end date NULL,
  auto_renew boolean DEFAULT true,
  billing_frequency text DEFAULT 'monthly',
  industry text NULL,
  geography text NULL,
  custom_terms text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_end ON public.customer_contracts(contract_end);
CREATE INDEX idx_contracts_customer ON public.customer_contracts(customer_id);
ALTER TABLE public.customer_contracts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES — admin-only on all acquisition tables
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'acquisition_metric_snapshots',
      'acquisition_risk_flags',
      'acquisition_contract_flags',
      'metric_definitions',
      'reconciliation_status',
      'diligence_checklist_items',
      'vendor_risk_registry',
      'customer_health_snapshots',
      'security_incidents',
      'operational_documents',
      'finance_monthly',
      'customer_contracts'
    ])
  LOOP
    EXECUTE format('CREATE POLICY "Admins read %1$I" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t);
    EXECUTE format('CREATE POLICY "Admins insert %1$I" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t);
    EXECUTE format('CREATE POLICY "Admins update %1$I" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t);
    EXECUTE format('CREATE POLICY "Admins delete %1$I" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))', t);
  END LOOP;
END $$;

-- ============================================================================
-- updated_at triggers
-- ============================================================================

CREATE TRIGGER trg_acq_risks_updated BEFORE UPDATE ON public.acquisition_risk_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_metric_defs_updated BEFORE UPDATE ON public.metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_recon_updated BEFORE UPDATE ON public.reconciliation_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_diligence_updated BEFORE UPDATE ON public.diligence_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_vendor_updated BEFORE UPDATE ON public.vendor_risk_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sec_incident_updated BEFORE UPDATE ON public.security_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_opdocs_updated BEFORE UPDATE ON public.operational_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_finance_updated BEFORE UPDATE ON public.finance_monthly
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.customer_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- SEED: Metric Definitions (the buyer-facing dictionary)
-- ============================================================================

INSERT INTO public.metric_definitions (metric_key, metric_name, category, formula, description, source_systems, unit, caveats) VALUES
  ('arr', 'Annual Recurring Revenue', 'revenue', 'MRR × 12', 'Annualized run-rate of all active recurring subscriptions at period end.', 'Stripe subscriptions', 'USD', 'Excludes one-time fees and non-recurring services.'),
  ('mrr', 'Monthly Recurring Revenue', 'revenue', 'SUM(active subscription monthly value)', 'Total monthly recurring revenue from all active customers.', 'Stripe subscriptions', 'USD', 'Annual plans normalized to monthly.'),
  ('net_new_arr', 'Net New ARR', 'revenue', 'New + Expansion − Contraction − Churn', 'Total ARR change in a period.', 'Stripe + customer_contracts', 'USD', null),
  ('new_arr', 'New ARR', 'revenue', 'SUM(ARR from new customers)', 'ARR from customers acquired in the period.', 'Stripe subscriptions', 'USD', null),
  ('expansion_arr', 'Expansion ARR', 'revenue', 'SUM(upgrade ARR delta)', 'ARR added from existing customer upgrades.', 'Stripe subscriptions', 'USD', null),
  ('contraction_arr', 'Contraction ARR', 'revenue', 'SUM(downgrade ARR delta)', 'ARR lost from existing customer downgrades.', 'Stripe subscriptions', 'USD', null),
  ('churned_arr', 'Churned ARR', 'revenue', 'SUM(ARR from cancelled customers)', 'ARR lost from full cancellations.', 'Stripe + cancellation_feedback', 'USD', null),
  ('nrr', 'Net Revenue Retention', 'retention', '(Starting ARR + Expansion − Contraction − Churn) / Starting ARR', 'Revenue retained from existing customers including expansion.', 'Stripe subscriptions', '%', 'Buyers expect >100% for healthy SaaS.'),
  ('grr', 'Gross Revenue Retention', 'retention', '(Starting ARR − Contraction − Churn) / Starting ARR', 'Revenue retained excluding expansion. Pure stickiness measure.', 'Stripe subscriptions', '%', null),
  ('logo_churn', 'Logo Churn Rate', 'retention', 'Customers Lost / Customers at Period Start', 'Percentage of customers who cancelled in the period.', 'Stripe subscriptions', '%', null),
  ('revenue_churn', 'Revenue Churn Rate', 'retention', 'Churned ARR / Starting ARR', 'Percentage of revenue lost to churn.', 'Stripe subscriptions', '%', null),
  ('cac', 'Customer Acquisition Cost', 'efficiency', 'Total S&M Spend / New Customers Acquired', 'Average cost to acquire one customer.', 'finance_monthly', 'USD', 'Requires manual S&M spend entry.'),
  ('ltv', 'Customer Lifetime Value', 'efficiency', 'ARPU × Gross Margin × (1 / Churn Rate)', 'Predicted lifetime revenue from a customer.', 'Computed', 'USD', 'Sensitive to churn rate assumption.'),
  ('ltv_cac', 'LTV:CAC Ratio', 'efficiency', 'LTV / CAC', 'Capital efficiency of customer acquisition.', 'Computed', 'ratio', 'Buyers look for 3:1 or better.'),
  ('cac_payback', 'CAC Payback Period', 'efficiency', 'CAC / (ARPU × Gross Margin)', 'Months to recover acquisition cost from a customer.', 'Computed', 'months', 'Best-in-class is under 12 months.'),
  ('magic_number', 'Magic Number', 'efficiency', 'Net New ARR × 4 / Prior Quarter S&M Spend', 'Sales efficiency on a quarterly basis.', 'Computed', 'ratio', '>1.0 indicates efficient growth.'),
  ('gross_margin', 'Gross Margin', 'finance', '(Revenue − COGS) / Revenue', 'Profit after direct cost of delivering service.', 'finance_monthly', '%', 'SaaS targets 75%+.'),
  ('rule_of_40', 'Rule of 40', 'finance', 'Growth Rate % + Profit Margin %', 'Combined growth and profitability score.', 'Computed', 'score', null),
  ('burn_rate', 'Burn Rate', 'finance', 'Monthly Cash Outflow', 'Net cash consumed per month.', 'finance_monthly', 'USD/mo', null),
  ('burn_multiple', 'Burn Multiple', 'finance', 'Net Burn / Net New ARR', 'Capital efficiency of growth.', 'Computed', 'ratio', '<1 is excellent, >2 raises concerns.'),
  ('cash_runway', 'Cash Runway', 'finance', 'Cash Balance / Burn Rate', 'Months of operations remaining at current burn.', 'finance_monthly', 'months', null),
  ('arr_per_employee', 'ARR per Employee', 'finance', 'ARR / Headcount', 'Operational efficiency benchmark.', 'finance_monthly', 'USD', null),
  ('top_customer_pct', 'Top Customer % of ARR', 'concentration', 'Largest Customer ARR / Total ARR', 'Single-customer concentration risk.', 'customer_contracts', '%', '>20% raises concentration risk for buyers.'),
  ('top_5_pct', 'Top 5 Customers % of ARR', 'concentration', 'SUM(Top 5 ARR) / Total ARR', 'Top-5 concentration risk.', 'customer_contracts', '%', null),
  ('top_10_pct', 'Top 10 Customers % of ARR', 'concentration', 'SUM(Top 10 ARR) / Total ARR', 'Top-10 concentration risk.', 'customer_contracts', '%', null),
  ('activation_rate', 'Activation Rate', 'product', 'Activated Accounts / Total Signups', 'Percentage of customers who reached the activation milestone.', 'retention_events', '%', 'Activation = first data received.'),
  ('time_to_activation', 'Time to Activation', 'product', 'Median(activation timestamp − signup timestamp)', 'How long it takes a new customer to get value.', 'retention_events', 'hours', null),
  ('reactivation_arr', 'Reactivation ARR', 'revenue', 'SUM(ARR from returning customers)', 'ARR from customers who previously churned and returned.', 'Stripe subscriptions', 'USD', null);

-- ============================================================================
-- SEED: Diligence Checklist
-- ============================================================================

INSERT INTO public.diligence_checklist_items (section_key, item_name, sort_order) VALUES
  ('revenue_support', 'Stripe revenue export (24 months)', 10),
  ('revenue_support', 'ARR/MRR bridge by month', 20),
  ('revenue_support', 'Refunds & chargebacks log', 30),
  ('revenue_support', 'Deferred revenue schedule', 40),
  ('customer_contracts', 'Signed master agreements for top 25 customers', 10),
  ('customer_contracts', 'Contract register with end dates', 20),
  ('customer_contracts', 'Side-letter and custom terms log', 30),
  ('retention_data', 'Cohort retention by signup month', 10),
  ('retention_data', 'Churn reason analysis', 20),
  ('retention_data', 'NRR/GRR trend (24 months)', 30),
  ('operating_metrics', 'Monthly P&L (24 months)', 10),
  ('operating_metrics', 'Headcount by function', 20),
  ('operating_metrics', 'Burn rate and runway forecast', 30),
  ('security_docs', 'SOC 2 or equivalent certification', 10),
  ('security_docs', 'Security policy', 20),
  ('security_docs', 'Incident response plan', 30),
  ('security_docs', 'Backup & restore test logs', 40),
  ('legal_ip_docs', 'Employee IP assignment agreements', 10),
  ('legal_ip_docs', 'Contractor IP assignment agreements', 20),
  ('legal_ip_docs', 'Trademark filings', 30),
  ('legal_ip_docs', 'Open-source license inventory', 40),
  ('vendor_list', 'Critical vendor inventory', 10),
  ('vendor_list', 'Vendor contracts on file', 20),
  ('forecasting_model', 'Current quarter forecast', 10),
  ('forecasting_model', 'Annual operating plan', 20),
  ('sop_runbooks', 'Customer onboarding runbook', 10),
  ('sop_runbooks', 'Incident response runbook', 20),
  ('sop_runbooks', 'Founder dependency map', 30);
