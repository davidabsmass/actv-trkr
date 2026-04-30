-- 1) Add the structural link
ALTER TABLE public.form_integrations
  ADD COLUMN IF NOT EXISTS form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_integrations_form_id ON public.form_integrations(form_id);

-- 2) Backfill the link for every existing integration by (site_id, provider, external_form_id)
UPDATE public.form_integrations fi
SET form_id = f.id
FROM public.forms f
WHERE fi.form_id IS NULL
  AND f.site_id = fi.site_id
  AND f.provider = fi.builder_type
  AND f.external_form_id = fi.external_form_id;

-- 3) For integrations without a forms row yet, create one and link
WITH missing AS (
  SELECT fi.id AS integration_id, fi.org_id, fi.site_id, fi.builder_type, fi.external_form_id, fi.form_name
  FROM public.form_integrations fi
  WHERE fi.form_id IS NULL
),
inserted AS (
  INSERT INTO public.forms (org_id, site_id, provider, external_form_id, name)
  SELECT org_id, site_id, builder_type, external_form_id, COALESCE(form_name, 'Untitled Form')
  FROM missing
  ON CONFLICT (site_id, provider, external_form_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, site_id, provider, external_form_id
)
UPDATE public.form_integrations fi
SET form_id = i.id
FROM inserted i, missing m
WHERE fi.id = m.integration_id
  AND i.site_id = m.site_id
  AND i.provider = m.builder_type
  AND i.external_form_id = m.external_form_id;

-- 4) Recompute total_entries_imported from REAL leads (truth, not cursor counter)
UPDATE public.form_integrations fi
SET total_entries_imported = COALESCE(c.n, 0)
FROM (
  SELECT form_id, COUNT(*)::int AS n FROM public.leads GROUP BY form_id
) c
WHERE c.form_id = fi.form_id;

-- 5) Auto-mark synced when the linked form has leads >= estimate (or estimate is 0/NULL)
UPDATE public.form_integrations
SET status = 'synced',
    last_synced_at = COALESCE(last_synced_at, now()),
    last_error = NULL
WHERE form_id IS NOT NULL
  AND status IN ('importing', 'detected')
  AND total_entries_imported > 0
  AND total_entries_imported >= COALESCE(total_entries_estimated, 0);

-- 6) Reset the stuck Apyx Contact Page job to drain cleanly with smaller batches
UPDATE public.form_import_jobs
SET status = 'pending',
    retry_count = 0,
    cursor = NULL,
    adaptive_batch_size = 10,
    next_run_at = now(),
    last_error = NULL,
    lock_token = NULL,
    locked_at = NULL
WHERE id = '252708e5-4ed5-4017-b187-d3b5e6e8f72f';