-- 1) Step-up token table for sensitive admin actions
CREATE TABLE IF NOT EXISTS public.admin_step_up_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_step_up_tokens_user
  ON public.admin_step_up_tokens(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_step_up_tokens_hash
  ON public.admin_step_up_tokens(token_hash);

ALTER TABLE public.admin_step_up_tokens ENABLE ROW LEVEL SECURITY;

-- No client policies — service role only.
-- (RLS enabled with no policy = nobody but service role can read/write.)

-- 2) admin_notes field-level encryption
-- Add encrypted column (nullable for backward compatibility)
ALTER TABLE public.admin_notes
  ADD COLUMN IF NOT EXISTS body_encrypted bytea;

-- Helper: encrypt a note body using a project-wide key.
-- The key is read from app_config.value where key='admin_notes_enc_key'.
-- Falls back to a deterministic derived key (NOT for prod — the edge function
-- must seed app_config before encryption is used).
CREATE OR REPLACE FUNCTION public.encrypt_admin_note(p_plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_plaintext IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO v_key FROM public.app_config WHERE key = 'admin_notes_enc_key';
  IF v_key IS NULL OR length(v_key) < 16 THEN
    RAISE EXCEPTION 'admin_notes_enc_key not configured (must be at least 16 chars in app_config)';
  END IF;
  RETURN extensions.pgp_sym_encrypt(p_plaintext, v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_admin_note(p_ciphertext bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_ciphertext IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO v_key FROM public.app_config WHERE key = 'admin_notes_enc_key';
  IF v_key IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(p_ciphertext, v_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Restrict execute on these helpers to service role only — direct admin
-- callers should never invoke these from the client. Edge functions use
-- the service role and will work.
REVOKE ALL ON FUNCTION public.encrypt_admin_note(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrypt_admin_note(bytea) FROM PUBLIC, anon, authenticated;