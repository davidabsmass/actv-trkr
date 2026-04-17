-- Fix FK constraints that block auth.users deletion
-- Make created_by nullable + SET NULL on delete to preserve history

ALTER TABLE public.export_jobs ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.export_jobs DROP CONSTRAINT export_jobs_created_by_fkey;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.report_runs ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.report_runs DROP CONSTRAINT report_runs_created_by_fkey;
ALTER TABLE public.report_runs ADD CONSTRAINT report_runs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.saved_views ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.saved_views DROP CONSTRAINT saved_views_created_by_fkey;
ALTER TABLE public.saved_views ADD CONSTRAINT saved_views_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make email-assets bucket public so email header images load in inboxes
UPDATE storage.buckets SET public = true WHERE id = 'email-assets';