ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS cancellation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS day25_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS day80_email_sent_at timestamptz;