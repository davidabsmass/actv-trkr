
-- Add primary_focus column to site_settings (keep primary_goal for backward compat)
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS primary_focus text NOT NULL DEFAULT 'lead_volume';

-- Create onboarding_responses table
CREATE TABLE public.onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  user_id uuid,
  completed_at timestamptz NOT NULL DEFAULT now(),
  primary_focus text NOT NULL,
  selected_forms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  notification_prefs_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_answers_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "or_select" ON public.onboarding_responses FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "or_insert" ON public.onboarding_responses FOR INSERT WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

-- Create user_input_events table (audit log)
CREATE TABLE public.user_input_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  user_id uuid,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_input_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uie_select" ON public.user_input_events FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "uie_insert" ON public.user_input_events FOR INSERT WITH CHECK (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
