REVOKE EXECUTE ON FUNCTION public.org_active_api_key_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.org_active_api_key_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_active_api_key_status(uuid) TO authenticated;