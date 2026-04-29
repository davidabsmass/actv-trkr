-- When an invited user signs in for the first time after accepting their invite,
-- flip any pending org_users rows from 'invited' to 'active' and stamp the
-- invite_accepted_at timestamp. This runs as the auth schema owner so it can
-- bypass RLS safely (the WHERE clause is locked to the auth user being updated).

CREATE OR REPLACE FUNCTION public.accept_pending_org_invites_on_signin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when last_sign_in_at transitions from NULL or moves forward.
  IF NEW.last_sign_in_at IS NOT NULL
     AND (OLD.last_sign_in_at IS NULL OR NEW.last_sign_in_at > OLD.last_sign_in_at)
  THEN
    UPDATE public.org_users
       SET status = 'active',
           invite_accepted_at = COALESCE(invite_accepted_at, now())
     WHERE user_id = NEW.id
       AND status = 'invited';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_signin_accept_invites ON auth.users;
CREATE TRIGGER on_auth_user_signin_accept_invites
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.accept_pending_org_invites_on_signin();