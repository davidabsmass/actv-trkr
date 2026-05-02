CREATE OR REPLACE FUNCTION public.event_matches_conversion_goal(
  p_event_type text,
  p_target_text text,
  p_page_url text,
  p_page_path text,
  p_meta jsonb,
  p_goal_type text,
  p_rules jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH vals AS (
    SELECT
      lower(coalesce(p_event_type, '')) AS event_type,
      lower(coalesce(p_target_text, '')) AS target_text,
      lower(coalesce(p_page_url, '')) AS page_url,
      lower(coalesce(p_page_path, '')) AS page_path,
      lower(coalesce(p_meta->>'target_label', '')) AS target_label,
      lower(coalesce(p_meta->>'target_href', '')) AS target_href,
      lower(coalesce(p_goal_type, '')) AS goal_type,
      coalesce(p_rules, '{}'::jsonb) AS rules
  ), checks AS (
    SELECT
      *,
      goal_type IN ('cta_click','outbound_click','tel_click','mailto_click') AS goal_is_click,
      event_type IN ('cta_click','outbound_click','tel_click','mailto_click') AS event_is_click,
      lower(coalesce(rules->>'text_contains', '')) AS text_needle,
      lower(coalesce(rules->>'href_contains', '')) AS href_needle,
      lower(coalesce(rules->>'page_path_contains', '')) AS page_path_needle,
      lower(coalesce(rules->>'event_name', '')) AS event_name,
      coalesce(rules->>'match', '') AS match_mode
    FROM vals
  )
  SELECT CASE
    WHEN match_mode = 'all' THEN true
    WHEN goal_type = 'custom_event' THEN event_name <> '' AND event_name = event_type
    WHEN goal_is_click AND NOT event_is_click THEN false
    WHEN NOT goal_is_click AND goal_type <> event_type THEN false
    WHEN goal_type IN ('tel_click','mailto_click') AND goal_type <> event_type THEN false
    WHEN text_needle <> '' AND target_text NOT LIKE '%' || text_needle || '%' AND target_label NOT LIKE '%' || text_needle || '%' THEN false
    WHEN href_needle <> ''
      AND replace(replace(target_href, '%20', ''), ' ', '') NOT LIKE '%' || replace(replace(href_needle, '%20', ''), ' ', '') || '%'
      AND replace(replace(page_url, '%20', ''), ' ', '') NOT LIKE '%' || replace(replace(href_needle, '%20', ''), ' ', '') || '%'
      AND replace(replace(target_text, '%20', ''), ' ', '') NOT LIKE '%' || replace(replace(href_needle, '%20', ''), ' ', '') || '%'
      AND replace(replace(target_label, '%20', ''), ' ', '') NOT LIKE '%' || replace(replace(href_needle, '%20', ''), ' ', '') || '%'
      AND NOT (target_href = '' AND text_needle <> '') THEN false
    WHEN page_path_needle <> '' AND page_path NOT LIKE '%' || page_path_needle || '%' THEN false
    ELSE true
  END
  FROM checks;
$$;

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
      AND (p_site_id IS NULL OR l.site_id = p_site_id)
  ),
  completion_sessions AS (
    SELECT DISTINCT gc.session_id AS sid
    FROM public.goal_completions gc
    WHERE gc.org_id = p_org_id
      AND gc.completed_at >= p_start
      AND gc.completed_at <= p_end
      AND gc.session_id IS NOT NULL
      AND (p_site_id IS NULL OR gc.site_id = p_site_id)
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
      AND e.session_id IS NOT NULL
      AND (p_site_id IS NULL OR e.site_id = p_site_id)
  ),
  goal_sessions AS (
    SELECT sid FROM completion_sessions
    UNION
    SELECT sid FROM matched_event_sessions
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
      pv.session_id,
      COUNT(*)::int AS pageview_count,
      COALESCE(SUM(pv.active_seconds), 0)::int AS active_seconds_total
    FROM public.pageviews pv
    WHERE pv.org_id = p_org_id
      AND pv.session_id IN (SELECT bs.session_id FROM base_sessions bs)
    GROUP BY pv.session_id
  ),
  exit_pv AS (
    SELECT DISTINCT ON (pv.session_id)
      pv.session_id,
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
    SELECT DISTINCT l.session_id
    FROM public.leads l
    WHERE l.org_id = p_org_id
      AND l.session_id IN (SELECT bs.session_id FROM base_sessions bs)
  ),
  completion_sessions AS (
    SELECT DISTINCT gc.session_id
    FROM public.goal_completions gc
    WHERE gc.org_id = p_org_id
      AND gc.session_id IN (SELECT bs.session_id FROM base_sessions bs)
  ),
  matched_event_sessions AS (
    SELECT DISTINCT e.session_id
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
    SELECT session_id FROM completion_sessions
    UNION
    SELECT session_id FROM matched_event_sessions
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
      (la.session_id IS NOT NULL) AS has_lead,
      (ga.session_id IS NOT NULL) AS has_conversion
    FROM base_sessions bs
    LEFT JOIN pv_agg pa ON pa.session_id = bs.session_id
    LEFT JOIN exit_pv ep ON ep.session_id = bs.session_id
    LEFT JOIN leads_agg la ON la.session_id = bs.session_id
    LEFT JOIN goals_agg ga ON ga.session_id = bs.session_id
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

GRANT EXECUTE ON FUNCTION public.event_matches_conversion_goal(text, text, text, text, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_converting_sources(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_journeys(uuid, timestamptz, timestamptz, uuid, text, integer, integer) TO authenticated;