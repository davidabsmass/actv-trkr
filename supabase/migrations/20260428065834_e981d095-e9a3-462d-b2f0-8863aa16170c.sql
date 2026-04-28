-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.mc_source AS ENUM (
    'signup','trial','early_access','demo_request',
    'manual_import','team_invite','report_subscribe_link','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mc_lifecycle_stage AS ENUM (
    'prospect','trial_user','subscriber','team_user','churned','suppressed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mc_consent_status AS ENUM (
    'unknown','not_opted_in','opted_in','unsubscribed','bounced','complained','suppressed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mc_email_provider AS ENUM (
    'none','mailchimp','brevo','loops','customer_io','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mc_event_type AS ENUM (
    'opt_in','unsubscribe','export','sync_attempt','suppress',
    'status_change','recipient_added','bounce','complaint'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- marketing_contacts (ACTV TRKR's own marketing list — admin-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NULL REFERENCES public.orgs(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  email_lower text GENERATED ALWAYS AS (lower(email)) STORED,
  first_name text,
  last_name text,
  company_name text,
  role text,
  source public.mc_source NOT NULL DEFAULT 'other',
  lifecycle_stage public.mc_lifecycle_stage NOT NULL DEFAULT 'prospect',
  marketing_consent_status public.mc_consent_status NOT NULL DEFAULT 'unknown',
  marketing_consent_source text,
  marketing_consent_text text,
  marketing_consent_timestamp timestamptz,
  marketing_consent_url text,
  consent_ip_hash text,
  email_provider public.mc_email_provider NOT NULL DEFAULT 'none',
  email_provider_contact_id text,
  unsubscribed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_email_lower_uniq
  ON public.marketing_contacts (email_lower);
CREATE INDEX IF NOT EXISTS marketing_contacts_org_idx
  ON public.marketing_contacts (org_id);
CREATE INDEX IF NOT EXISTS marketing_contacts_user_idx
  ON public.marketing_contacts (user_id);
CREATE INDEX IF NOT EXISTS marketing_contacts_consent_idx
  ON public.marketing_contacts (marketing_consent_status);
CREATE INDEX IF NOT EXISTS marketing_contacts_lifecycle_idx
  ON public.marketing_contacts (lifecycle_stage);
CREATE INDEX IF NOT EXISTS marketing_contacts_source_idx
  ON public.marketing_contacts (source);

DROP TRIGGER IF EXISTS trg_marketing_contacts_updated_at ON public.marketing_contacts;
CREATE TRIGGER trg_marketing_contacts_updated_at
  BEFORE UPDATE ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mc_admin_select" ON public.marketing_contacts;
CREATE POLICY "mc_admin_select" ON public.marketing_contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "mc_admin_insert" ON public.marketing_contacts;
CREATE POLICY "mc_admin_insert" ON public.marketing_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "mc_admin_update" ON public.marketing_contacts;
CREATE POLICY "mc_admin_update" ON public.marketing_contacts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "mc_admin_delete" ON public.marketing_contacts;
CREATE POLICY "mc_admin_delete" ON public.marketing_contacts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "mc_service_all" ON public.marketing_contacts;
CREATE POLICY "mc_service_all" ON public.marketing_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- marketing_contact_events (audit log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  email_lower text,
  event_type public.mc_event_type NOT NULL,
  actor_user_id uuid NULL,
  actor_type text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mce_contact_idx ON public.marketing_contact_events (contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS mce_email_idx ON public.marketing_contact_events (email_lower, occurred_at DESC);
CREATE INDEX IF NOT EXISTS mce_event_type_idx ON public.marketing_contact_events (event_type, occurred_at DESC);

ALTER TABLE public.marketing_contact_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mce_admin_select" ON public.marketing_contact_events;
CREATE POLICY "mce_admin_select" ON public.marketing_contact_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "mce_service_all" ON public.marketing_contact_events;
CREATE POLICY "mce_service_all" ON public.marketing_contact_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Extend leads (additive, no logic change)
-- ============================================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS customer_marketing_consent_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS customer_marketing_consent_text text,
  ADD COLUMN IF NOT EXISTS customer_marketing_consent_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS customer_marketing_consent_field_name text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text;

DO $$ BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_customer_consent_status_check
    CHECK (customer_marketing_consent_status IN
      ('unknown','not_detected','opted_in','not_opted_in','unsubscribed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS leads_customer_consent_idx
  ON public.leads (org_id, customer_marketing_consent_status);

-- ============================================================================
-- Extend profiles
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_consent_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS marketing_consent_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_marketing_consent_status_check
    CHECK (marketing_consent_status IN
      ('unknown','not_opted_in','opted_in','unsubscribed','bounced','complained','suppressed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Helper: get_site_contacts (aggregated, org-scoped view of leads)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_site_contacts(
  p_org_id uuid,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  email text,
  display_name text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  lead_count bigint,
  source_sites text[],
  source_forms text[],
  source_pages text[],
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  customer_consent_status text,
  tags text[],
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_org_member(p_org_id) OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized for org %', p_org_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH lead_emails AS (
    SELECT
      l.id AS lead_id,
      l.org_id,
      l.site_id,
      l.form_id,
      l.submitted_at,
      l.page_url,
      l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.utm_term,
      l.customer_marketing_consent_status,
      l.tags,
      lower(COALESCE(
        l.data->>'email',
        l.data->>'Email',
        l.data->>'email_address',
        (SELECT lff.field_value FROM public.lead_fields_flat lff
          WHERE lff.lead_id = l.id
            AND (lower(lff.field_label) LIKE '%email%' OR lower(lff.field_key) LIKE '%email%')
            AND lff.field_value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
          LIMIT 1)
      )) AS email_lc,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', l.data->>'first_name', l.data->>'last_name')), ''),
        l.data->>'name', l.data->>'full_name', l.data->>'Name'
      ) AS display_name
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.status IS DISTINCT FROM 'trashed'
  ),
  filtered AS (
    SELECT * FROM lead_emails
    WHERE email_lc IS NOT NULL
      AND email_lc ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      AND (p_search IS NULL OR email_lc LIKE '%' || lower(p_search) || '%'
           OR lower(COALESCE(display_name,'')) LIKE '%' || lower(p_search) || '%')
  ),
  agg AS (
    SELECT
      f.email_lc AS email,
      MAX(f.display_name) AS display_name,
      MIN(f.submitted_at) AS first_seen_at,
      MAX(f.submitted_at) AS last_seen_at,
      COUNT(*)::bigint AS lead_count,
      ARRAY_AGG(DISTINCT s.host) FILTER (WHERE s.host IS NOT NULL) AS source_sites,
      ARRAY_AGG(DISTINCT fm.name) FILTER (WHERE fm.name IS NOT NULL) AS source_forms,
      ARRAY_AGG(DISTINCT f.page_url) FILTER (WHERE f.page_url IS NOT NULL) AS source_pages,
      (ARRAY_AGG(f.utm_source ORDER BY f.submitted_at DESC) FILTER (WHERE f.utm_source IS NOT NULL))[1] AS utm_source,
      (ARRAY_AGG(f.utm_medium ORDER BY f.submitted_at DESC) FILTER (WHERE f.utm_medium IS NOT NULL))[1] AS utm_medium,
      (ARRAY_AGG(f.utm_campaign ORDER BY f.submitted_at DESC) FILTER (WHERE f.utm_campaign IS NOT NULL))[1] AS utm_campaign,
      (ARRAY_AGG(f.utm_content ORDER BY f.submitted_at DESC) FILTER (WHERE f.utm_content IS NOT NULL))[1] AS utm_content,
      (ARRAY_AGG(f.utm_term ORDER BY f.submitted_at DESC) FILTER (WHERE f.utm_term IS NOT NULL))[1] AS utm_term,
      (ARRAY_AGG(f.customer_marketing_consent_status ORDER BY f.submitted_at DESC))[1] AS customer_consent_status,
      ARRAY(SELECT DISTINCT unnest(COALESCE(f.tags, '{}'::text[]))) AS tags
    FROM filtered f
    LEFT JOIN public.sites s ON s.id = f.site_id
    LEFT JOIN public.forms fm ON fm.id = f.form_id
    GROUP BY f.email_lc
  ),
  counted AS (SELECT COUNT(*) AS total FROM agg)
  SELECT a.email, a.display_name, a.first_seen_at, a.last_seen_at, a.lead_count,
         a.source_sites, a.source_forms, a.source_pages,
         a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content, a.utm_term,
         a.customer_consent_status, a.tags, c.total
  FROM agg a CROSS JOIN counted c
  ORDER BY a.last_seen_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 1000))
  OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.get_site_contacts(uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_site_contacts(uuid, integer, integer, text) TO authenticated;
