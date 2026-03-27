
CREATE TABLE public.subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  site_url text,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  churn_date timestamptz,
  churn_reason text,
  last_active_date timestamptz,
  referral_source text,
  white_label_enabled boolean NOT NULL DEFAULT false,
  features_used jsonb DEFAULT '[]'::jsonb,
  ai_calls_per_day_avg numeric DEFAULT 0,
  report_downloads integer DEFAULT 0,
  mrr numeric NOT NULL DEFAULT 30
);

CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid REFERENCES public.subscribers(id) ON DELETE SET NULL,
  action text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on subscribers"
  ON public.subscribers FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on error_logs"
  ON public.error_logs FOR ALL
  TO service_role USING (true) WITH CHECK (true);
