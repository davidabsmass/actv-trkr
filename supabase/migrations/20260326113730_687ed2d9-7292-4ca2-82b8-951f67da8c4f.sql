
-- Table to store identified WordPress site visitors
CREATE TABLE public.site_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  wp_user_id text,
  wp_user_name text,
  wp_user_email text,
  wp_user_role text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, site_id, visitor_id)
);

ALTER TABLE public.site_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view site visitors"
  ON public.site_visitors FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE INDEX idx_site_visitors_org_site ON public.site_visitors(org_id, site_id);
CREATE INDEX idx_site_visitors_wp_user ON public.site_visitors(org_id, wp_user_email) WHERE wp_user_email IS NOT NULL;
