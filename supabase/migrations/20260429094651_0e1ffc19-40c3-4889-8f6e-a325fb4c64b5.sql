-- Stop recovery-link sessions from prematurely accepting team invites.
DROP TRIGGER IF EXISTS on_auth_user_signin_accept_invites ON auth.users;
DROP FUNCTION IF EXISTS public.accept_pending_org_invites_on_signin();

-- Accept pending invites only when the app explicitly completes the password setup flow.
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

-- Repair invite rows created during the premature-active period.
UPDATE public.org_users
   SET status = 'invited',
       invited_at = COALESCE(invited_at, created_at),
       updated_at = now()
 WHERE status = 'active'
   AND is_owner = false
   AND invited_by IS NOT NULL
   AND invite_accepted_at IS NULL;