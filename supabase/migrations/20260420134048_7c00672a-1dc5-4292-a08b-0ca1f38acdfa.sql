
-- Release QA status enum
DO $$ BEGIN
  CREATE TYPE public.release_qa_status AS ENUM (
    'running','passed','passed_with_warnings','failed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.release_qa_check_status AS ENUM (
    'pass','fail','warn','not_run','manual_pending','error'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Runs table
CREATE TABLE IF NOT EXISTS public.release_qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_version text NOT NULL,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_by_email text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status public.release_qa_status NOT NULL DEFAULT 'running',
  scope text NOT NULL DEFAULT 'full', -- 'full' | 'category:<key>' | 'check:<key>'
  totals jsonb NOT NULL DEFAULT '{"pass":0,"fail":0,"warn":0,"not_run":0,"manual_pending":0,"error":0}'::jsonb,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_release_qa_runs_started_at
  ON public.release_qa_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_qa_runs_app_version
  ON public.release_qa_runs(app_version, started_at DESC);

-- Results table
CREATE TABLE IF NOT EXISTS public.release_qa_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.release_qa_runs(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  category_key text NOT NULL,
  check_type text NOT NULL CHECK (check_type IN ('automated','manual','hybrid')),
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status public.release_qa_check_status NOT NULL,
  duration_ms integer,
  message text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ran_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, check_key)
);

CREATE INDEX IF NOT EXISTS idx_release_qa_results_run
  ON public.release_qa_results(run_id);
CREATE INDEX IF NOT EXISTS idx_release_qa_results_status
  ON public.release_qa_results(status);

-- Manual sign-off table (per app version, persists across reruns)
CREATE TABLE IF NOT EXISTS public.release_qa_manual_signoff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_version text NOT NULL,
  check_key text NOT NULL,
  signed_off_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_off_by_email text,
  signed_off_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(app_version, check_key)
);

CREATE INDEX IF NOT EXISTS idx_release_qa_manual_signoff_version
  ON public.release_qa_manual_signoff(app_version);

-- RLS: admin only
ALTER TABLE public.release_qa_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_qa_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_qa_manual_signoff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read release_qa_runs" ON public.release_qa_runs;
CREATE POLICY "Admins read release_qa_runs"
  ON public.release_qa_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins write release_qa_runs" ON public.release_qa_runs;
CREATE POLICY "Admins write release_qa_runs"
  ON public.release_qa_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins read release_qa_results" ON public.release_qa_results;
CREATE POLICY "Admins read release_qa_results"
  ON public.release_qa_results FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins write release_qa_results" ON public.release_qa_results;
CREATE POLICY "Admins write release_qa_results"
  ON public.release_qa_results FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins read release_qa_manual_signoff" ON public.release_qa_manual_signoff;
CREATE POLICY "Admins read release_qa_manual_signoff"
  ON public.release_qa_manual_signoff FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins write release_qa_manual_signoff" ON public.release_qa_manual_signoff;
CREATE POLICY "Admins write release_qa_manual_signoff"
  ON public.release_qa_manual_signoff FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
