-- Valuation Modeling schema

CREATE TABLE public.valuation_comparables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  ticker TEXT,
  industry TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'm_and_a', -- m_and_a, public_comp, private_round
  transaction_date DATE,
  deal_value NUMERIC,
  revenue NUMERIC,
  ebitda NUMERIC,
  arr NUMERIC,
  ev_revenue_multiple NUMERIC,
  ev_ebitda_multiple NUMERIC,
  ev_arr_multiple NUMERIC,
  growth_rate_pct NUMERIC,
  source_notes TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_valuation_comparables_industry ON public.valuation_comparables(industry);

CREATE TABLE public.valuation_scenarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_name TEXT NOT NULL,
  description TEXT,

  -- Base financial inputs
  base_arr NUMERIC,
  base_revenue NUMERIC,
  base_ebitda NUMERIC,
  growth_rate_pct NUMERIC, -- forward growth assumption
  ebitda_margin_pct NUMERIC,

  -- Multiples inputs
  ev_arr_multiple_low NUMERIC,
  ev_arr_multiple_mid NUMERIC,
  ev_arr_multiple_high NUMERIC,
  ev_revenue_multiple_low NUMERIC,
  ev_revenue_multiple_mid NUMERIC,
  ev_revenue_multiple_high NUMERIC,
  ev_ebitda_multiple_low NUMERIC,
  ev_ebitda_multiple_mid NUMERIC,
  ev_ebitda_multiple_high NUMERIC,

  -- DCF inputs
  dcf_projection_years INTEGER NOT NULL DEFAULT 5,
  dcf_discount_rate_pct NUMERIC,
  dcf_terminal_growth_pct NUMERIC,
  dcf_terminal_multiple NUMERIC,
  dcf_fcf_margin_pct NUMERIC,

  -- Computed outputs (snapshotted on save)
  computed_low NUMERIC,
  computed_mid NUMERIC,
  computed_high NUMERIC,
  computed_breakdown JSONB DEFAULT '{}'::jsonb,

  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.valuation_comparables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage valuation comparables" ON public.valuation_comparables
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage valuation scenarios" ON public.valuation_scenarios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_valuation_comparables_updated_at
  BEFORE UPDATE ON public.valuation_comparables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_valuation_scenarios_updated_at
  BEFORE UPDATE ON public.valuation_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();