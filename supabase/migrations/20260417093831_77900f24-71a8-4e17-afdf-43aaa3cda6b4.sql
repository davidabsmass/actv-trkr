CREATE TABLE IF NOT EXISTS public.retention_settings (
  id integer PRIMARY KEY DEFAULT 1,
  no_data_rescue_hours integer NOT NULL DEFAULT 48,
  no_second_login_hours integer NOT NULL DEFAULT 168,
  inactivity_warning_days integer NOT NULL DEFAULT 30,
  weekly_summary_enabled boolean NOT NULL DEFAULT true,
  default_pause_days integer NOT NULL DEFAULT 30,
  default_save_offer text NOT NULL DEFAULT 'pause',
  sender_name text NOT NULL DEFAULT 'ACTV TRKR',
  sender_email text NOT NULL DEFAULT 'support@actvtrkr.com',
  reply_to_email text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT retention_settings_singleton CHECK (id = 1)
);

ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read retention settings" ON public.retention_settings;
CREATE POLICY "Admins read retention settings" ON public.retention_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update retention settings" ON public.retention_settings;
CREATE POLICY "Admins update retention settings" ON public.retention_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert retention settings" ON public.retention_settings;
CREATE POLICY "Admins insert retention settings" ON public.retention_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.retention_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_retention_cohorts(p_weeks integer DEFAULT 12)
RETURNS TABLE (
  cohort_week date,
  cohort_size integer,
  week_offset integer,
  active_count integer,
  retention_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH signups AS (
    SELECT o.id AS org_id, date_trunc('week', o.created_at)::date AS cohort_week
    FROM public.orgs o
    WHERE o.created_at >= now() - (p_weeks || ' weeks')::interval
  ),
  cohort_sizes AS (
    SELECT cohort_week, COUNT(*)::integer AS cohort_size
    FROM signups GROUP BY cohort_week
  ),
  activity AS (
    SELECT DISTINCT
      s.cohort_week, s.org_id,
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (le.logged_in_at - s.cohort_week)) / (7*86400))::integer) AS week_offset
    FROM signups s
    JOIN public.login_events le ON le.org_id = s.org_id
    WHERE le.logged_in_at >= s.cohort_week
  ),
  buckets AS (
    SELECT cohort_week, week_offset, COUNT(DISTINCT org_id)::integer AS active_count
    FROM activity GROUP BY cohort_week, week_offset
  )
  SELECT b.cohort_week, cs.cohort_size, b.week_offset, b.active_count,
         ROUND((b.active_count::numeric / NULLIF(cs.cohort_size, 0)) * 100, 1) AS retention_pct
  FROM buckets b
  JOIN cohort_sizes cs ON cs.cohort_week = b.cohort_week
  ORDER BY b.cohort_week DESC, b.week_offset ASC;
END;
$$;