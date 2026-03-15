
-- seo_fix_queue table
CREATE TABLE public.seo_fix_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  page_url text NOT NULL,
  issue_id text NOT NULL,
  fix_type text NOT NULL,
  fix_value text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  scan_id uuid REFERENCES public.seo_scans(id)
);

ALTER TABLE public.seo_fix_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sfq_select" ON public.seo_fix_queue FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "sfq_insert" ON public.seo_fix_queue FOR INSERT WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
CREATE POLICY "sfq_update" ON public.seo_fix_queue FOR UPDATE USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

-- seo_fix_history table
CREATE TABLE public.seo_fix_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  issue_id text NOT NULL,
  page_url text NOT NULL,
  fixed_at timestamptz NOT NULL DEFAULT now(),
  before_score integer,
  after_score integer
);

ALTER TABLE public.seo_fix_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sfh_select" ON public.seo_fix_history FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "sfh_insert" ON public.seo_fix_history FOR INSERT WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
