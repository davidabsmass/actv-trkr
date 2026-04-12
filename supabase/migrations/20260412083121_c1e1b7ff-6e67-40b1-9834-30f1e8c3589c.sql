
-- 1. Add allowed_domains to sites for domain validation
ALTER TABLE public.sites
ADD COLUMN IF NOT EXISTS allowed_domains text[] NOT NULL DEFAULT '{}';

-- Auto-populate allowed_domains with existing domain for all sites
UPDATE public.sites
SET allowed_domains = ARRAY[domain]
WHERE allowed_domains = '{}';

-- 2. Create ingestion_anomalies table for security monitoring
CREATE TABLE IF NOT EXISTS public.ingestion_anomalies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  anomaly_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  detected_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ingestion_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ia_select" ON public.ingestion_anomalies
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_ingestion_anomalies_org_detected
  ON public.ingestion_anomalies (org_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_anomalies_type
  ON public.ingestion_anomalies (anomaly_type, detected_at DESC);

-- 3. Hash existing wp_user_email in site_visitors to remove plain-text PII
-- Add hashed email column
ALTER TABLE public.site_visitors
ADD COLUMN IF NOT EXISTS wp_user_email_hash text;

-- 4. Ensure login_events ip_address is handled
-- We won't drop the column (backward compat) but we'll handle hashing in the edge function
