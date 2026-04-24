-- Multi-site support: additive, backward-compatible schema changes
-- 1) Add nullable display_name to sites (UI label distinct from domain)
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS display_name text;

-- 2) Add nullable site_id to api_keys as a future hook for per-site keys
--    Existing org-level keys keep site_id NULL and remain canonical.
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_api_keys_site_id ON public.api_keys(site_id) WHERE site_id IS NOT NULL;

-- 3) Prevent duplicate active sites with the same domain inside the same org.
--    Uses a partial unique index that excludes archived/disconnected so deletes/renames stay safe.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_site_per_org_domain
  ON public.sites(org_id, lower(domain))
  WHERE status NOT IN ('archived', 'disconnected');