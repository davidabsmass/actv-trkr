-- Track invitation state on org_users
ALTER TABLE public.org_users
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_org_users_org_status
  ON public.org_users(org_id, status);

-- Helper: when an invitee signs in for the first time, flip status from
-- 'invited' -> 'active' and stamp invite_accepted_at. Idempotent.
CREATE OR REPLACE FUNCTION public.mark_invite_accepted()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.org_users
     SET status = 'active',
         invite_accepted_at = COALESCE(invite_accepted_at, now()),
         updated_at = now()
   WHERE user_id = auth.uid()
     AND status = 'invited';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_invite_accepted() TO authenticated;