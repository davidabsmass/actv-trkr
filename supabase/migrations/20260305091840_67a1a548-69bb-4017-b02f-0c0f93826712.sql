
-- Create events table for behavioral click tracking
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  session_id text,
  visitor_id text,
  event_type text NOT NULL,
  page_url text,
  page_path text,
  target_text text,
  meta jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select" ON public.events FOR SELECT TO authenticated
  USING (is_org_member(org_id));

-- Add active_seconds to pageviews for time-on-page tracking
ALTER TABLE public.pageviews ADD COLUMN IF NOT EXISTS active_seconds integer;

-- Add engagement_score to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS engagement_score integer;

-- Indexes for performance
CREATE INDEX idx_events_session ON public.events(session_id);
CREATE INDEX idx_events_org_type ON public.events(org_id, event_type, occurred_at);
CREATE INDEX idx_pageviews_session_active ON public.pageviews(session_id) WHERE active_seconds IS NOT NULL;

-- Engagement score function (on-demand calculation)
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(p_session_id text, p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  score integer := 0;
  v_active_seconds integer;
  v_page_count integer;
  v_high_intent integer;
  v_cta_clicks integer;
  v_downloads integer;
  v_form_starts integer;
  v_form_submits integer;
BEGIN
  IF p_session_id IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(active_seconds), 0) INTO v_active_seconds
  FROM pageviews WHERE session_id = p_session_id AND org_id = p_org_id;

  IF v_active_seconds >= 180 THEN score := score + 15;
  ELSIF v_active_seconds >= 90 THEN score := score + 10;
  ELSIF v_active_seconds >= 30 THEN score := score + 5;
  END IF;

  SELECT COUNT(DISTINCT page_path) INTO v_page_count
  FROM pageviews WHERE session_id = p_session_id AND org_id = p_org_id;
  IF v_page_count >= 3 THEN score := score + 10; END IF;

  SELECT COUNT(DISTINCT page_path) INTO v_high_intent
  FROM pageviews WHERE session_id = p_session_id AND org_id = p_org_id
  AND (page_path ILIKE '%pricing%' OR page_path ILIKE '%contact%'
       OR page_path ILIKE '%demo%' OR page_path ILIKE '%quote%'
       OR page_path ILIKE '%schedule%' OR page_path ILIKE '%book%');
  score := score + LEAST(v_high_intent * 10, 30);

  SELECT COUNT(*) INTO v_cta_clicks
  FROM events WHERE session_id = p_session_id AND org_id = p_org_id AND event_type = 'cta_click';
  score := score + LEAST(v_cta_clicks * 10, 30);

  SELECT COUNT(*) INTO v_downloads
  FROM events WHERE session_id = p_session_id AND org_id = p_org_id AND event_type = 'download_click';
  score := score + LEAST(v_downloads * 15, 30);

  SELECT COUNT(*) INTO v_form_starts
  FROM events WHERE session_id = p_session_id AND org_id = p_org_id AND event_type = 'form_start';
  IF v_form_starts > 0 THEN score := score + 10; END IF;

  SELECT COUNT(*) INTO v_form_submits
  FROM leads WHERE session_id = p_session_id AND org_id = p_org_id;
  IF v_form_submits > 0 THEN score := score + 25; END IF;

  RETURN LEAST(score, 100);
END;
$$;
