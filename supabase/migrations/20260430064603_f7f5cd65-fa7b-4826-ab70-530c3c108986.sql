CREATE OR REPLACE FUNCTION public.reconcile_form_integration_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Recompute imported count from real leads
  UPDATE public.form_integrations fi
  SET total_entries_imported = COALESCE(c.n, 0)
  FROM (
    SELECT form_id, COUNT(*)::int AS n FROM public.leads GROUP BY form_id
  ) c
  WHERE fi.form_id IS NOT NULL
    AND c.form_id = fi.form_id
    AND fi.total_entries_imported IS DISTINCT FROM COALESCE(c.n, 0);

  -- 2) Auto-mark synced when truth has caught up (or exceeded estimate)
  UPDATE public.form_integrations
  SET status = 'synced',
      last_synced_at = COALESCE(last_synced_at, now()),
      last_error = NULL
  WHERE form_id IS NOT NULL
    AND status = 'importing'
    AND total_entries_imported > 0
    AND total_entries_imported >= COALESCE(total_entries_estimated, 0);

  -- 3) Close completed jobs whose integration is now synced
  UPDATE public.form_import_jobs j
  SET status = 'completed',
      last_error = NULL,
      next_run_at = NULL,
      lock_token = NULL,
      locked_at = NULL
  FROM public.form_integrations fi
  WHERE j.form_integration_id = fi.id
    AND j.status IN ('pending', 'running', 'stalled')
    AND fi.status = 'synced';

  -- 4) Backfill missing form_id links (defensive — discover should already do this)
  UPDATE public.form_integrations fi
  SET form_id = f.id
  FROM public.forms f
  WHERE fi.form_id IS NULL
    AND f.site_id = fi.site_id
    AND f.provider = fi.builder_type
    AND f.external_form_id = fi.external_form_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_form_integration_counters() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_form_integration_counters() TO service_role;