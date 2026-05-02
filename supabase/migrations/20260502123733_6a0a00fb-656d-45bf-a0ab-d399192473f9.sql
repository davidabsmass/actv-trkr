CREATE OR REPLACE FUNCTION public.get_top_converting_sources(
  p_org_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_site_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  session_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_referrer_domain text,
  has_lead boolean,
  has_conversion boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_org_member(p_org_id) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized for org %', p_org_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH lead_sessions AS (
    SELECT DISTINCT l.session_id AS sid
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.submitted_at >= p_start
      AND l.submitted_at <= p_end
      AND l.session_id IS NOT NULL
  ),
  goal_sessions AS (
    SELECT DISTINCT gc.session_id AS sid
    FROM public.goal_completions gc
    WHERE gc.org_id = p_org_id
      AND gc.completed_at >= p_start
      AND gc.completed_at <= p_end
      AND gc.session_id IS NOT NULL
  ),
  converting_session_ids AS (
    SELECT sid FROM lead_sessions
    UNION
    SELECT sid FROM goal_sessions
  )
  SELECT
    s.session_id,
    s.utm_source,
    s.utm_medium,
    s.utm_campaign,
    s.landing_referrer_domain,
    (ls.sid IS NOT NULL) AS has_lead,
    (gs.sid IS NOT NULL) AS has_conversion
  FROM public.sessions s
  JOIN converting_session_ids c ON c.sid = s.session_id
  LEFT JOIN lead_sessions ls ON ls.sid = s.session_id
  LEFT JOIN goal_sessions gs ON gs.sid = s.session_id
  WHERE s.org_id = p_org_id
    AND (p_site_id IS NULL OR s.site_id = p_site_id);
END;
$function$;