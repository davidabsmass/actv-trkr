-- 1. Historical wp_user_email cleanup: hash existing emails and null plain-text
-- Uses the same hashing approach as the edge function (SHA-256 with salt, truncated to 16 chars)
-- We can't replicate the exact Edge Function hash in SQL easily, so we use pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE public.site_visitors
SET wp_user_email_hash = encode(digest(wp_user_email || '_actv_salt_2026', 'sha256'), 'hex'),
    wp_user_email = NULL
WHERE wp_user_email IS NOT NULL AND wp_user_email != '';

-- 2. IP anonymization in login_events: add ip_hash column
ALTER TABLE public.login_events ADD COLUMN IF NOT EXISTS ip_hash text;

-- Backfill: hash existing IPs and null the raw column
UPDATE public.login_events
SET ip_hash = LEFT(encode(digest(ip_address || '_actv_salt_2026', 'sha256'), 'hex'), 16),
    ip_address = NULL
WHERE ip_address IS NOT NULL AND ip_address != '';

-- 3. Consent configuration table
CREATE TABLE IF NOT EXISTS public.consent_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  consent_mode text NOT NULL DEFAULT 'strict',
  require_consent_before_tracking boolean NOT NULL DEFAULT true,
  retention_months integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

ALTER TABLE public.consent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_select" ON public.consent_config
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "cc_insert" ON public.consent_config
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) IN ('admin', 'member'));

CREATE POLICY "cc_update" ON public.consent_config
  FOR UPDATE TO authenticated
  USING (user_org_role(org_id) IN ('admin', 'member'));

-- Trigger for updated_at
CREATE TRIGGER update_consent_config_updated_at
  BEFORE UPDATE ON public.consent_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();