REVOKE ALL ON FUNCTION public.mark_invite_accepted() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_invite_accepted() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_invite_accepted() TO authenticated;