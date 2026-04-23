CREATE OR REPLACE FUNCTION public.get_session_journey_stats(
  p_org_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_site_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (public.is_org_member(p_org_id) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized for org %', p_org_id USING ERRCODE = '42501';
  END IF;

  WITH base_sessions AS (
    SELECT
      s.session_id,
      s.site_id,
      s.landing_page_path,
      LOWER(regexp_replace(COALESCE(s.landing_referrer_domain, ''), '^www\.', '')) AS ref_domain_norm,
      s.landing_referrer_domain,
      s.utm_source,
      s.utm_medium
    FROM public.sessions s
    WHERE s.org_id = p_org_id
      AND s.started_at >= p_start
      AND s.started_at <= p_end
      AND (p_site_id IS NULL OR s.site_id = p_site_id)
  ),
  site_domains AS (
    SELECT
      st.id AS site_id,
      LOWER(regexp_replace(COALESCE(st.domain, ''), '^www\.', '')) AS site_domain_norm
    FROM public.sites st
    WHERE st.org_id = p_org_id
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
  joined AS (
    SELECT
      bs.session_id,
      bs.landing_page_path,
      bs.landing_referrer_domain,
      bs.ref_domain_norm,
      sd.site_domain_norm,
      (bs.ref_domain_norm <> '' AND bs.ref_domain_norm = sd.site_domain_norm) AS is_self_ref,
      bs.utm_source,
      bs.utm_medium,
      COALESCE(pa.pageview_count, 0) AS pageview_count,
      COALESCE(pa.active_seconds_total, 0) AS active_seconds,
      ep.exit_path,
      ep.device,
      ep.country_code,
      (la.session_id IS NOT NULL) AS has_lead
    FROM base_sessions bs
    LEFT JOIN site_domains sd ON sd.site_id = bs.site_id
    LEFT JOIN pv_agg pa ON pa.session_id = bs.session_id
    LEFT JOIN exit_pv ep ON ep.session_id = bs.session_id
    LEFT JOIN leads_agg la ON la.session_id = bs.session_id
  )
  SELECT jsonb_build_object(
    'total_sessions', (SELECT COUNT(*) FROM joined),
    'total_leads', (SELECT COUNT(*) FROM joined WHERE has_lead),
    'avg_active_seconds', (SELECT COALESCE(ROUND(AVG(active_seconds))::int, 0) FROM joined),
    'avg_pageviews', (SELECT COALESCE(ROUND(AVG(pageview_count)::numeric, 1), 0) FROM joined),
    'bounced_sessions', (SELECT COUNT(*) FROM joined WHERE pageview_count <= 1 AND active_seconds < 30 AND NOT has_lead),
    'engaged_sessions', (SELECT COUNT(*) FROM joined WHERE (pageview_count >= 2 OR active_seconds >= 30) AND NOT has_lead),
    'top_entry_pages', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT COALESCE(landing_page_path, '/') AS path, COUNT(*)::int AS sessions
        FROM joined GROUP BY 1 ORDER BY sessions DESC LIMIT 8
      ) t
    ),
    'top_exit_pages', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT COALESCE(exit_path, '/') AS path, COUNT(*)::int AS sessions
        FROM joined WHERE exit_path IS NOT NULL GROUP BY 1 ORDER BY sessions DESC LIMIT 8
      ) t
    ),
    'top_sources', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT
          COALESCE(
            NULLIF(utm_source, ''),
            CASE WHEN is_self_ref THEN NULL ELSE NULLIF(landing_referrer_domain, '') END,
            'Direct'
          ) AS source,
          COUNT(*)::int AS sessions,
          COUNT(*) FILTER (WHERE has_lead)::int AS leads
        FROM joined GROUP BY 1 ORDER BY sessions DESC LIMIT 8
      ) t
    ),
    'device_breakdown', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT COALESCE(NULLIF(device, ''), 'unknown') AS device, COUNT(*)::int AS sessions
        FROM joined GROUP BY 1 ORDER BY sessions DESC LIMIT 5
      ) t
    ),
    'top_countries', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT COALESCE(NULLIF(country_code, ''), 'XX') AS country, COUNT(*)::int AS sessions
        FROM joined WHERE country_code IS NOT NULL GROUP BY 1 ORDER BY sessions DESC LIMIT 8
      ) t
    ),
    'top_converting_pages', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT
          COALESCE(landing_page_path, '/') AS path,
          COUNT(*) FILTER (WHERE has_lead)::int AS leads,
          COUNT(*)::int AS sessions
        FROM joined WHERE has_lead GROUP BY 1 ORDER BY leads DESC LIMIT 8
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;