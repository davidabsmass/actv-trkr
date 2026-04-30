-- Unstick the 2 import jobs by advancing cursors past the persistently-failing batches.
-- Both jobs: WP returns 40 entries but ingest-form rejects ~10 deterministically.
-- We retry the same cursor forever. Skip ahead by ~50 to clear the bad window.
-- The reconciler/discovery will re-import any genuinely missing entries on next sync.

UPDATE form_import_jobs
SET cursor = '673',  -- was 623, advance past the bad batch
    retry_count = 0,
    last_error = 'Cursor advanced past 10 deterministically-failing entries (auto-heal)',
    next_run_at = now(),
    adaptive_batch_size = 50,
    status = 'pending',
    lock_token = NULL,
    locked_at = NULL
WHERE id = '252708e5-4ed5-4017-b187-d3b5e6e8f72f';

UPDATE form_import_jobs
SET cursor = '29083',  -- was 29033, advance past the bad batch
    retry_count = 0,
    last_error = 'Cursor advanced past 8 deterministically-failing entries (auto-heal)',
    next_run_at = now(),
    adaptive_batch_size = 50,
    status = 'pending',
    lock_token = NULL,
    locked_at = NULL
WHERE id = 'a611b2db-f5e3-4337-9aae-e2030d2f0b96';