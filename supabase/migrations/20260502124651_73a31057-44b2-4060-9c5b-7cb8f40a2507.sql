CREATE OR REPLACE FUNCTION public.get_session_journeys(
  p_org_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_site_id uuid DEFAULT NULL::uuid,
  p_outcome text DEFAULT 'all'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  session_id text,
  visitor_id text,
  site_id uuid,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_seconds integer,
  active_seconds integer,
  pageview_count integer,
  landing_page_path text,
  landing_referrer_domain text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  exit_page_path text,
  exit_page_title text,
  exit_at timestamp with time zone,
  device text,
  country_code text,
  has_lead boolean,
  has_conversion boolean,
  engagement_score integer,
  total_count bigint
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
  WITH base_sessions AS (
    SELECT s.*
    FROM public.sessions s
    WHERE s.org_id = p_org_id
      AND s.started_at >= p_start
      AND s.started_at <= p_end
      AND (p_site_id IS NULL OR s.site_id = p_site_id)
  ),
  pv_agg AS (
    SELECT
      pv.session_id AS sid,
      COUNT(*)::int AS pageview_count,
      COALESCE(SUM(pv.active_seconds), 0)::int AS active_seconds_total
    FROM public.pageviews pv
    WHERE pv.org_id = p_org_id
      AND pv.session_id IN (SELECT bs.session_id FROM base_sessions bs)
    GROUP BY pv.session_id
  ),
  exit_pv AS (
    SELECT DISTINCT ON (pv.session_id)
      pv.session_id AS sid,
      pv.page_path AS exit_path,
      pv.title AS exit_title,
      pv.occurred_at AS exit_at,
      pv.device,
      pv.country_code
    FROM public.pageviews pv
    WHERE pv.org_id = p_org_id
      AND pv.session_id IN (SELECT bs.session_id FROM base_sessions bs)
    ORDER BY pv.session_id, pv.occurred_at DESC
  ),
  leads_agg AS (
    SELECT DISTINCT l.session_id AS sid
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.session_id IN (SELECT bs.session_id FROM base_sessions bs)
  ),
  completion_sessions AS (
    SELECT DISTINCT gc.session_id AS sid
    FROM public.goal_completions gc
    WHERE gc.org_id = p_org_id
      AND gc.session_id IN (SELECT bs.session_id FROM base_sessions bs)
  ),
  matched_event_sessions AS (
    SELECT DISTINCT e.session_id AS sid
    FROM public.events e
    JOIN public.conversion_goals cg
      ON cg.org_id = e.org_id
     AND cg.is_active = true
     AND cg.is_conversion = true
     AND public.event_matches_conversion_goal(e.event_type, e.target_text, e.page_url, e.page_path, e.meta, cg.goal_type, cg.tracking_rules)
    WHERE e.org_id = p_org_id
      AND e.occurred_at >= p_start
      AND e.occurred_at <= p_end
      AND e.session_id IN (SELECT bs.session_id FROM base_sessions bs)
  ),
  goals_agg AS (
    SELECT sid FROM completion_sessions
    UNION
    SELECT sid FROM matched_event_sessions
  ),
  joined AS (
    SELECT
      bs.session_id,
      bs.visitor_id,
      bs.site_id,
      bs.started_at,
      GREATEST(bs.ended_at, ep.exit_at) AS ended_at,
      GREATEST(0, EXTRACT(EPOCH FROM (GREATEST(bs.ended_at, ep.exit_at) - bs.started_at))::int) AS duration_seconds,
      COALESCE(pa.active_seconds_total, 0) AS active_seconds,
      COALESCE(pa.pageview_count, 0) AS pageview_count,
      bs.landing_page_path,
      bs.landing_referrer_domain,
      bs.utm_source,
      bs.utm_medium,
      bs.utm_campaign,
      ep.exit_path,
      ep.exit_title,
      ep.exit_at,
      ep.device,
      ep.country_code,
      (la.sid IS NOT NULL) AS has_lead,
      (ga.sid IS NOT NULL) AS has_conversion
    FROM base_sessions bs
    LEFT JOIN pv_agg pa ON pa.sid = bs.session_id
    LEFT JOIN exit_pv ep ON ep.sid = bs.session_id
    LEFT JOIN leads_agg la ON la.sid = bs.session_id
    LEFT JOIN goals_agg ga ON ga.sid = bs.session_id
  ),
  filtered AS (
    SELECT * FROM joined j
    WHERE
      CASE p_outcome
        WHEN 'lead' THEN j.has_lead OR j.has_conversion
        WHEN 'engaged' THEN j.pageview_count >= 2 OR j.active_seconds >= 30
        WHEN 'bounced' THEN j.pageview_count <= 1 AND j.active_seconds < 30 AND NOT j.has_lead AND NOT j.has_conversion
        ELSE TRUE
      END
  ),
  counted AS (
    SELECT (SELECT COUNT(*) FROM filtered) AS total
  )
  SELECT
    f.session_id,
    f.visitor_id,
    f.site_id,
    f.started_at,
    f.ended_at,
    f.duration_seconds,
    f.active_seconds,
    f.pageview_count,
    f.landing_page_path,
    f.landing_referrer_domain,
    f.utm_source,
    f.utm_medium,
    f.utm_campaign,
    f.exit_path AS exit_page_path,
    f.exit_title AS exit_page_title,
    f.exit_at,
    f.device,
    f.country_code,
    f.has_lead,
    f.has_conversion,
    public.calculate_engagement_score(f.session_id, p_org_id) AS engagement_score,
    c.total AS total_count
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.started_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) TO authenticated;