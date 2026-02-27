
-- Site settings table for goal + notification preferences + onboarding state
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  primary_goal text NOT NULL DEFAULT 'get_more_leads',
  notification_preferences jsonb NOT NULL DEFAULT '{"weekly_summary": true, "break_alerts": true, "daily_digest": false}'::jsonb,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss_select" ON public.site_settings FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "ss_insert" ON public.site_settings FOR INSERT WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
CREATE POLICY "ss_update" ON public.site_settings FOR UPDATE USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

-- Add is_primary_lead to forms
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS is_primary_lead boolean NOT NULL DEFAULT true;

-- Dashboard snapshots for shareable links
CREATE TABLE public.dashboard_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  created_by uuid NOT NULL,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ds_select_public" ON public.dashboard_snapshots FOR SELECT USING (true);
CREATE POLICY "ds_insert" ON public.dashboard_snapshots FOR INSERT WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

-- Trigger for site_settings updated_at
CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
