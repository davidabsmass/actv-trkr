-- Heal the two stuck Gravity import jobs.
-- We pin them to "completed" so the import-queue stops looping, and reset
-- total_processed to a sane upper bound so the integration row stops
-- showing inflated counts. The reconciler will recompute parity on its
-- next 15-min pass using the new safeInsertFlatRows path.
WITH stuck_jobs AS (
  SELECT id, form_integration_id
  FROM public.form_import_jobs
  WHERE id IN (
    'a611b2db-f5e3-4337-9aae-e2030d2f0b96', -- Lives in the Balance, GF id=7
    '252708e5-4ed5-4017-b187-d3b5e6e8f72f'  -- Apyx, GF id=1
  )
)
UPDATE public.form_import_jobs j
SET status            = 'completed',
    retry_count       = 0,
    last_error        = 'Healed by ops migration: stuck same-cursor loop cleared; reconciler will fill gaps.',
    next_run_at       = NULL,
    locked_at         = NULL,
    lock_token        = NULL,
    adaptive_batch_size = 50,
    total_processed   = LEAST(total_processed, total_expected),
    updated_at        = now()
FROM stuck_jobs s
WHERE j.id = s.id;

-- Mirror the same correction onto the form_integrations row so the UI
-- counter (Total Submissions) stops showing the inflated number.
UPDATE public.form_integrations fi
SET total_entries_imported = LEAST(fi.total_entries_imported, fi.total_entries_estimated),
    status     = 'synced',
    last_error = NULL,
    updated_at = now()
WHERE fi.id IN (
  SELECT form_integration_id FROM public.form_import_jobs
  WHERE id IN (
    'a611b2db-f5e3-4337-9aae-e2030d2f0b96',
    '252708e5-4ed5-4017-b187-d3b5e6e8f72f'
  )
);

-- Re-enable every Gravity form on Lives in the Balance. The previous
-- (broken) plugin is_active reporter was pinning them to false on every
-- reconcile cycle. Plugin v1.21.6 fixes the report; this seed flip stops
-- the dashboard from showing "Active (0) / Disabled (7)" while the new
-- plugin propagates.
UPDATE public.forms
SET is_active = true
WHERE site_id = 'dc61131d-53cb-4f24-a3a6-e8b95849ca94'
  AND provider = 'gravity_forms'
  AND archived = false;

UPDATE public.form_integrations
SET is_active = true
WHERE site_id = 'dc61131d-53cb-4f24-a3a6-e8b95849ca94'
  AND builder_type = 'gravity_forms';

-- Re-enable the Apyx "Find a Licensed Provider Near You" form (GF id=7)
-- which was sliding back to Disabled for the same root cause.
UPDATE public.forms
SET is_active = true
WHERE site_id = 'dca0794b-7ef9-46c8-bd3d-a7b8f14bf668'
  AND provider = 'gravity_forms'
  AND external_form_id = '7'
  AND archived = false;

UPDATE public.form_integrations
SET is_active = true
WHERE site_id = 'dca0794b-7ef9-46c8-bd3d-a7b8f14bf668'
  AND builder_type = 'gravity_forms'
  AND external_form_id = '7';