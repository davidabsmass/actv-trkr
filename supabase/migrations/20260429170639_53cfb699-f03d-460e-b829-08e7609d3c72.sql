
-- Add plugin reachability tracking columns to sites
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS plugin_status text,
  ADD COLUMN IF NOT EXISTS plugin_status_checked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS plugin_status_detail text,
  ADD COLUMN IF NOT EXISTS last_form_reconcile_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_form_reconcile_status text;

-- Constraint to keep values predictable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_plugin_status_chk'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_plugin_status_chk
      CHECK (plugin_status IS NULL OR plugin_status IN ('healthy','disconnected','unreachable'));
  END IF;
END $$;

-- Index to let the reconciler cron quickly find sites due for a check
CREATE INDEX IF NOT EXISTS sites_plugin_status_checked_at_idx
  ON public.sites (plugin_status_checked_at NULLS FIRST)
  WHERE type = 'wordpress';
