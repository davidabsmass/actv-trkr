ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS pending_plan text,
  ADD COLUMN IF NOT EXISTS first_connected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer_id
  ON public.orgs(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_status_pending
  ON public.orgs(status) WHERE status = 'pending_connection';