-- Track consecutive silent cron cycles to support the two-strike rule
-- in check-tracking-health. A site is only flagged as stalled after it
-- has been silent for 2 consecutive cycles AND failed an active probe.
ALTER TABLE public.site_tracking_status
  ADD COLUMN IF NOT EXISTS consecutive_silent_checks integer NOT NULL DEFAULT 0;