
-- Invite codes table
CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_uses integer DEFAULT 0,
  use_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ic_select" ON public.invite_codes FOR SELECT
  USING (user_org_role(org_id) = 'admin');

CREATE POLICY "ic_insert" ON public.invite_codes FOR INSERT
  WITH CHECK (user_org_role(org_id) = 'admin');

CREATE POLICY "ic_update" ON public.invite_codes FOR UPDATE
  USING (user_org_role(org_id) = 'admin');

-- Public lookup policy so signup can validate codes (no auth required)
CREATE POLICY "ic_public_lookup" ON public.invite_codes FOR SELECT
  USING (active = true AND (expires_at IS NULL OR expires_at > now()));
