
-- =============================================
-- 1) archive_manifest — tracks cold-archived data
-- =============================================
CREATE TABLE public.archive_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('sessions', 'pageviews', 'form_submissions')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  object_path TEXT NOT NULL,
  file_format TEXT NOT NULL DEFAULT 'csv_gzip' CHECK (file_format IN ('parquet_gzip', 'jsonl_gzip', 'csv_gzip')),
  row_count INTEGER NOT NULL DEFAULT 0,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT
);

CREATE INDEX idx_archive_manifest_lookup
  ON public.archive_manifest (org_id, table_name, start_date, end_date);

ALTER TABLE public.archive_manifest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "am_select" ON public.archive_manifest
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "am_insert" ON public.archive_manifest
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin');

-- =============================================
-- 2) subscription_status — org-level billing state
-- =============================================
CREATE TABLE public.subscription_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  canceled_at TIMESTAMPTZ,
  grace_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ss2_select" ON public.subscription_status
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "ss2_update" ON public.subscription_status
  FOR UPDATE TO authenticated
  USING (user_org_role(org_id) = 'admin');

CREATE POLICY "ss2_insert" ON public.subscription_status
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin');

CREATE TRIGGER update_subscription_status_updated_at
  BEFORE UPDATE ON public.subscription_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3) Extend site_settings with archive/retention columns
-- =============================================
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS raw_retention_days INTEGER NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS archive_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archive_format TEXT NOT NULL DEFAULT 'csv_gzip'
    CHECK (archive_format IN ('parquet_gzip', 'jsonl_gzip', 'csv_gzip'));

-- =============================================
-- 4) Extend export_jobs with archive export columns
-- =============================================
ALTER TABLE public.export_jobs
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'raw_export'
    CHECK (request_type IN ('raw_export', 'archive_export')),
  ADD COLUMN IF NOT EXISTS table_name TEXT CHECK (table_name IN ('sessions', 'pageviews', 'form_submissions', 'leads')),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS filters_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_size_bytes BIGINT;

-- =============================================
-- 5) monthly_aggregates — forever retained
-- =============================================
CREATE TABLE public.monthly_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of month
  metric TEXT NOT NULL,
  dimension TEXT,
  value NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (org_id, month, metric, dimension)
);

CREATE INDEX idx_monthly_agg_lookup
  ON public.monthly_aggregates (org_id, month);

ALTER TABLE public.monthly_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ma_select" ON public.monthly_aggregates
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));

-- =============================================
-- 6) deletion_audit — tracks cleanup of canceled orgs
-- =============================================
CREATE TABLE public.deletion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "da_select" ON public.deletion_audit
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- 7) Archives storage bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('archives', 'archives', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "archives_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'archives');

CREATE POLICY "archives_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'archives');

-- =============================================
-- 8) Add indexes on raw tables for archive queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_pageviews_org_occurred
  ON public.pageviews (org_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_sessions_org_started
  ON public.sessions (org_id, started_at);

CREATE INDEX IF NOT EXISTS idx_leads_org_submitted
  ON public.leads (org_id, submitted_at);
