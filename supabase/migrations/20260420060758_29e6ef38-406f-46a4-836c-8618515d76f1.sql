CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS processed_stripe_events_processed_at_idx
  ON public.processed_stripe_events (processed_at DESC);

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- No public policies. Service role bypasses RLS, which is what the webhook uses.
-- Explicitly deny everything to authenticated/anon for clarity.
CREATE POLICY "deny all to anon"
  ON public.processed_stripe_events
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny all to authenticated"
  ON public.processed_stripe_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.processed_stripe_events IS
  'Idempotency ledger for Stripe webhook (actv-webhook). Inserted at the top of the handler; INSERT failure on duplicate event_id short-circuits processing. See SECURITY_AUDIT.md H-7.';