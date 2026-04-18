DO $$
DECLARE
  has_old_constraint boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'forms'
      AND c.conname = 'forms_org_id_site_id_provider_external_form_id_key'
  ) INTO has_old_constraint;

  CREATE TEMP TABLE forms_dedupe_map ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      f.id AS old_form_id,
      FIRST_VALUE(f.id) OVER (
        PARTITION BY f.site_id, f.provider, f.external_form_id
        ORDER BY
          CASE WHEN f.org_id = s.org_id THEN 0 ELSE 1 END,
          f.created_at DESC,
          f.id DESC
      ) AS canonical_form_id,
      s.org_id AS site_org_id,
      f.site_id
    FROM public.forms f
    JOIN public.sites s ON s.id = f.site_id
  )
  SELECT DISTINCT old_form_id, canonical_form_id, site_org_id, site_id
  FROM ranked;

  DELETE FROM public.lead_events_raw r
  USING forms_dedupe_map m, public.lead_events_raw existing
  WHERE r.form_id = m.old_form_id
    AND m.old_form_id <> m.canonical_form_id
    AND existing.org_id = m.site_org_id
    AND existing.site_id = r.site_id
    AND existing.form_id = m.canonical_form_id
    AND existing.external_entry_id = r.external_entry_id;

  UPDATE public.lead_events_raw r
  SET
    form_id = m.canonical_form_id,
    org_id = m.site_org_id
  FROM forms_dedupe_map m
  WHERE r.form_id = m.old_form_id
    AND r.form_id <> m.canonical_form_id;

  UPDATE public.leads l
  SET
    form_id = m.canonical_form_id,
    org_id = m.site_org_id
  FROM forms_dedupe_map m
  WHERE l.form_id = m.old_form_id
    AND l.form_id <> m.canonical_form_id;

  DELETE FROM public.conversions_daily cd
  USING forms_dedupe_map m, public.conversions_daily existing
  WHERE cd.form_id = m.old_form_id
    AND m.old_form_id <> m.canonical_form_id
    AND existing.site_id = cd.site_id
    AND existing.day = cd.day
    AND existing.form_id = m.canonical_form_id
    AND existing.page_url IS NOT DISTINCT FROM cd.page_url;

  UPDATE public.conversions_daily cd
  SET form_id = m.canonical_form_id
  FROM forms_dedupe_map m
  WHERE cd.form_id = m.old_form_id
    AND cd.form_id <> m.canonical_form_id;

  DELETE FROM public.field_mappings fm
  USING forms_dedupe_map m, public.field_mappings existing
  WHERE fm.form_id = m.old_form_id
    AND m.old_form_id <> m.canonical_form_id
    AND existing.org_id = m.site_org_id
    AND existing.form_id = m.canonical_form_id
    AND existing.external_field_id = fm.external_field_id;

  UPDATE public.field_mappings fm
  SET
    form_id = m.canonical_form_id,
    org_id = m.site_org_id
  FROM forms_dedupe_map m
  WHERE fm.form_id = m.old_form_id
    AND fm.form_id <> m.canonical_form_id;

  DELETE FROM public.form_health_checks fh
  USING forms_dedupe_map m, public.form_health_checks existing
  WHERE fh.form_id = m.old_form_id
    AND m.old_form_id <> m.canonical_form_id
    AND existing.org_id = m.site_org_id
    AND existing.site_id = fh.site_id
    AND existing.form_id = m.canonical_form_id;

  UPDATE public.form_health_checks fh
  SET
    form_id = m.canonical_form_id,
    org_id = m.site_org_id
  FROM forms_dedupe_map m
  WHERE fh.form_id = m.old_form_id
    AND fh.form_id <> m.canonical_form_id;

  UPDATE public.form_submission_logs fsl
  SET
    form_id = m.canonical_form_id,
    org_id = m.site_org_id
  FROM forms_dedupe_map m
  WHERE fsl.form_id = m.old_form_id
    AND fsl.form_id <> m.canonical_form_id;

  UPDATE public.saved_views sv
  SET form_id = m.canonical_form_id
  FROM forms_dedupe_map m
  WHERE sv.form_id = m.old_form_id
    AND sv.form_id <> m.canonical_form_id;

  DELETE FROM public.forms f
  USING forms_dedupe_map m
  WHERE f.id = m.old_form_id
    AND m.old_form_id <> m.canonical_form_id;

  UPDATE public.forms f
  SET org_id = s.org_id
  FROM public.sites s
  WHERE f.site_id = s.id
    AND f.org_id IS DISTINCT FROM s.org_id;

  IF has_old_constraint THEN
    ALTER TABLE public.forms
      DROP CONSTRAINT forms_org_id_site_id_provider_external_form_id_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'forms'
      AND c.conname = 'forms_site_id_provider_external_form_id_key'
  ) THEN
    ALTER TABLE public.forms
      ADD CONSTRAINT forms_site_id_provider_external_form_id_key
      UNIQUE (site_id, provider, external_form_id);
  END IF;
END $$;