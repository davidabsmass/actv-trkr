
-- White label settings per org
CREATE TABLE public.white_label_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE UNIQUE,
  client_name text DEFAULT '',
  logo_url text DEFAULT '',
  primary_color text DEFAULT '#6366f1',
  secondary_color text DEFAULT '#8b5cf6',
  accent_color text DEFAULT '#f59e0b',
  hide_actv_branding boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wl_select" ON public.white_label_settings
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "wl_upsert" ON public.white_label_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin');

CREATE POLICY "wl_update" ON public.white_label_settings
  FOR UPDATE TO authenticated
  USING (user_org_role(org_id) = 'admin');

-- Trigger for updated_at
CREATE TRIGGER set_wl_updated_at
  BEFORE UPDATE ON public.white_label_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for client logos
INSERT INTO storage.buckets (id, name, public) VALUES ('client-logos', 'client-logos', true);

-- Storage policies for client-logos bucket
CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-logos');

CREATE POLICY "Anyone can view logos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'client-logos');

CREATE POLICY "Authenticated users can update logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'client-logos');

CREATE POLICY "Authenticated users can delete logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-logos');
