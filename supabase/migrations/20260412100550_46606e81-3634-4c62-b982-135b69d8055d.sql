-- Add background processing columns to form_import_jobs
ALTER TABLE public.form_import_jobs
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lock_token uuid,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS adaptive_batch_size integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS auto_resume_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Index for background queue polling
CREATE INDEX IF NOT EXISTS idx_fij_queue_poll
  ON public.form_import_jobs (status, next_run_at)
  WHERE status IN ('pending', 'running', 'stalled');