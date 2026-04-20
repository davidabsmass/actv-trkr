-- Add the HMAC signing secret column
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS signing_secret text;

-- Backfill existing rows with a fresh signing secret so v1.18.1 plugins
-- can immediately bootstrap. encode(gen_random_bytes(32),'hex') -> 64-char hex.
UPDATE public.api_keys
   SET signing_secret = encode(gen_random_bytes(32), 'hex')
 WHERE signing_secret IS NULL;

-- New rows must always have a signing secret.
ALTER TABLE public.api_keys
  ALTER COLUMN signing_secret SET NOT NULL,
  ALTER COLUMN signing_secret SET DEFAULT encode(gen_random_bytes(32), 'hex');

COMMENT ON COLUMN public.api_keys.signing_secret IS
  'HMAC-SHA256 signing secret for backend\u2194plugin requests. Distinct from key_hash so the stored hash cannot be replayed as a credential (Security Audit C-2). Hex-encoded 32 bytes.';

-- Replay-protection table: every (org, nonce) seen within the last 10 min.
CREATE TABLE IF NOT EXISTS public.signed_request_nonces (
  org_id uuid NOT NULL,
  nonce text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, nonce)
);

CREATE INDEX IF NOT EXISTS signed_request_nonces_seen_at_idx
  ON public.signed_request_nonces (seen_at);

ALTER TABLE public.signed_request_nonces ENABLE ROW LEVEL SECURITY;

-- Service role only \u2014 explicit deny for any other role.
CREATE POLICY "deny all to anon"
  ON public.signed_request_nonces
  FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY "deny all to authenticated"
  ON public.signed_request_nonces
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.signed_request_nonces IS
  'Replay-protection ledger for HMAC-signed requests. Inserted on every verified call; PK collision = replay attempt. Cleaned up by nightly cron after 10 minutes.';