-- 1. Trigger function: ensure every new org gets a strict consent_config row
CREATE OR REPLACE FUNCTION public.ensure_org_consent_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.consent_config (org_id, consent_mode, require_consent_before_tracking, retention_months)
  VALUES (NEW.id, 'strict', true, 12)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Attach trigger to orgs (drop first to keep idempotent)
DROP TRIGGER IF EXISTS trg_orgs_ensure_consent_config ON public.orgs;
CREATE TRIGGER trg_orgs_ensure_consent_config
AFTER INSERT ON public.orgs
FOR EACH ROW
EXECUTE FUNCTION public.ensure_org_consent_config();

-- 3. Backfill any existing orgs that don't have a consent_config row yet
INSERT INTO public.consent_config (org_id, consent_mode, require_consent_before_tracking, retention_months)
SELECT o.id, 'strict', true, 12
FROM public.orgs o
LEFT JOIN public.consent_config cc ON cc.org_id = o.id
WHERE cc.id IS NULL
ON CONFLICT (org_id) DO NOTHING;