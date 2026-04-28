REVOKE ALL ON FUNCTION public.feature_enabled(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_tracking_health(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_rate_limit_observation(uuid, uuid, text, text, text, integer, integer, boolean, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.feature_enabled(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_tracking_health(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_rate_limit_observation(uuid, uuid, text, text, text, integer, integer, boolean, jsonb) TO authenticated, service_role;