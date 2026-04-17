
ALTER TABLE public.tracking_interruptions
  ADD COLUMN IF NOT EXISTS customer_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_email_recipient text;

ALTER TABLE public.site_tracking_status
  ADD COLUMN IF NOT EXISTS verifier_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS verifier_last_status text,
  ADD COLUMN IF NOT EXISTS verifier_last_message text;

CREATE TABLE IF NOT EXISTS public.admin_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  digest_date date NOT NULL,
  recipient_email text NOT NULL,
  payload jsonb,
  UNIQUE (digest_type, digest_date, recipient_email)
);

ALTER TABLE public.admin_digest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role only - admin_digest_log"
  ON public.admin_digest_log
  FOR ALL
  USING (false)
  WITH CHECK (false);
