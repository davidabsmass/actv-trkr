
-- Customer profiles table for post-activation profiling
CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  customer_type text,
  website_count_range text,
  acquisition_source text,
  completed_at timestamptz,
  skipped_at timestamptz,
  dismissed_count integer NOT NULL DEFAULT 0,
  last_prompted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cp_select" ON public.customer_profiles
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "cp_insert" ON public.customer_profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "cp_update" ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id));

-- Trigger for updated_at
CREATE TRIGGER update_customer_profiles_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
