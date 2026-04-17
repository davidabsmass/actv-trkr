-- Anomaly detection rules (admin-configured thresholds)
CREATE TABLE public.acquisition_anomaly_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  description TEXT,
  metric_category TEXT NOT NULL,
  threshold_value NUMERIC,
  threshold_operator TEXT NOT NULL DEFAULT '>',
  severity TEXT NOT NULL DEFAULT 'medium',
  is_active BOOLEAN NOT NULL DEFAULT true,
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_in_app BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detected anomalies (history of triggered alerts)
CREATE TABLE public.acquisition_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES public.acquisition_anomaly_rules(id) ON DELETE SET NULL,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metric_value NUMERIC,
  threshold_value NUMERIC,
  delta_pct NUMERIC,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_org_id UUID,
  linked_customer_id UUID,
  status TEXT NOT NULL DEFAULT 'open',
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  notified_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_acq_anomalies_status ON public.acquisition_anomalies(status, detected_at DESC);
CREATE INDEX idx_acq_anomalies_severity ON public.acquisition_anomalies(severity, status);
CREATE INDEX idx_acq_anomalies_rule ON public.acquisition_anomalies(rule_key, detected_at DESC);

ALTER TABLE public.acquisition_anomaly_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisition_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage anomaly rules"
ON public.acquisition_anomaly_rules FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage anomalies"
ON public.acquisition_anomalies FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_anomaly_rules_updated
BEFORE UPDATE ON public.acquisition_anomaly_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_anomalies_updated
BEFORE UPDATE ON public.acquisition_anomalies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rules
INSERT INTO public.acquisition_anomaly_rules (rule_key, rule_name, description, metric_category, threshold_value, threshold_operator, severity) VALUES
('mrr_drop_pct', 'MRR Drop > 5%', 'Triggers when month-over-month MRR drops by more than 5%', 'revenue', 5, '>', 'high'),
('churn_spike_pct', 'Churn Spike > 3%', 'Monthly logo churn rate exceeds 3%', 'retention', 3, '>', 'high'),
('concentration_risk_pct', 'Customer Concentration > 25%', 'Single customer accounts for >25% of MRR', 'concentration', 25, '>', 'critical'),
('cohort_retention_cliff', 'Cohort Retention Cliff', 'Cohort retention drops >20pp between consecutive weeks', 'retention', 20, '>', 'medium'),
('cac_payback_blowout', 'CAC Payback > 18mo', 'CAC payback period exceeds 18 months', 'efficiency', 18, '>', 'medium'),
('gross_margin_drop', 'Gross Margin < 70%', 'Gross margin falls below 70% threshold', 'efficiency', 70, '<', 'high'),
('arr_growth_stall', 'ARR Growth < 1% MoM', 'ARR growth stalls below 1% month-over-month', 'revenue', 1, '<', 'medium'),
('high_value_customer_at_risk', 'Top Customer Health < 50', 'A top-10 customer health score drops below 50', 'risk', 50, '<', 'critical');