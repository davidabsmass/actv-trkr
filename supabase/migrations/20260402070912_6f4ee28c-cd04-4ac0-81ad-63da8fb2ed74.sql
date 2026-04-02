
CREATE TABLE public.site_wp_environment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  wp_version text,
  php_version text,
  theme_name text,
  theme_version text,
  active_plugins jsonb DEFAULT '[]'::jsonb,
  plugin_updates jsonb DEFAULT '[]'::jsonb,
  core_update_available text,
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id)
);

ALTER TABLE public.site_wp_environment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swpe_select" ON public.site_wp_environment
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
