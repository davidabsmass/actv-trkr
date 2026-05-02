REVOKE ALL ON FUNCTION public.event_matches_conversion_goal(text, text, text, text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_matches_conversion_goal(text, text, text, text, jsonb, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.event_matches_conversion_goal(text, text, text, text, jsonb, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.get_top_converting_sources(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_top_converting_sources(uuid, timestamptz, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_top_converting_sources(uuid, timestamptz, timestamptz, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) TO authenticated;