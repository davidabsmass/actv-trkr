
CREATE OR REPLACE FUNCTION public.get_top_exit_pages(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  page_path text,
  page_url text,
  title text,
  total_exits bigint,
  total_pageviews_on_page bigint,
  exit_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH exit_pages AS (
    SELECT DISTINCT ON (session_id)
      page_path,
      page_url,
      title
    FROM public.pageviews
    WHERE org_id = p_org_id
      AND occurred_at >= p_start_date
      AND occurred_at <= p_end_date
      AND session_id IS NOT NULL
    ORDER BY session_id, occurred_at DESC
  ),
  exit_counts AS (
    SELECT
      page_path,
      MAX(page_url) AS page_url,
      MAX(title) AS title,
      COUNT(*) AS total_exits
    FROM exit_pages
    GROUP BY page_path
  ),
  page_totals AS (
    SELECT
      page_path,
      COUNT(*) AS total_pageviews_on_page
    FROM public.pageviews
    WHERE org_id = p_org_id
      AND occurred_at >= p_start_date
      AND occurred_at <= p_end_date
    GROUP BY page_path
  )
  SELECT
    ec.page_path,
    ec.page_url,
    ec.title,
    ec.total_exits,
    COALESCE(pt.total_pageviews_on_page, ec.total_exits) AS total_pageviews_on_page,
    CASE
      WHEN COALESCE(pt.total_pageviews_on_page, 0) > 0
      THEN ROUND((ec.total_exits::numeric / pt.total_pageviews_on_page) * 100, 1)
      ELSE 100.0
    END AS exit_rate
  FROM exit_counts ec
  LEFT JOIN page_totals pt ON ec.page_path = pt.page_path
  ORDER BY ec.total_exits DESC
  LIMIT p_limit;
$$;
