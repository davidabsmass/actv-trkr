CREATE TABLE IF NOT EXISTS public.password_reset_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  consumed_ip_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_password_reset_links_token_hash
  ON public.password_reset_links (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_links_email_created_at
  ON public.password_reset_links (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_links_expires_at
  ON public.password_reset_links (expires_at);