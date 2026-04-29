-- 1. Add normalized key column
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS external_entry_key text;

-- 2. Backfill normalization
UPDATE public.leads l
SET external_entry_key = sub.key
FROM (
  SELECT l2.id,
    CASE
      WHEN f.provider = 'avada' AND l2.external_entry_id ~ '^[0-9]+$'
        THEN 'avada:' || l2.external_entry_id
      WHEN f.provider = 'avada' AND l2.external_entry_id ~ '^avada_db_[0-9]+$'
        THEN 'avada:' || regexp_replace(l2.external_entry_id, '^avada_db_', '')
      WHEN f.provider = 'avada' AND l2.external_entry_id ~ '^avada_[0-9]+_[0-9]+$'
        THEN 'avada_legacy:' || l2.external_entry_id
      WHEN l2.external_entry_id IS NOT NULL
        THEN f.provider || ':' || l2.external_entry_id
      ELSE NULL
    END AS key
  FROM public.leads l2
  JOIN public.forms f ON f.id = l2.form_id
) sub
WHERE l.id = sub.id;

-- 3. Create backup of all duplicate rows (any provider) that will be removed
CREATE TABLE IF NOT EXISTS public.leads_predupe_backup_2026_04_29 AS
SELECT l.* FROM public.leads l
WHERE l.id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY form_id, external_entry_key
        ORDER BY
          (CASE WHEN data IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM jsonb_object_keys(data)) END) DESC,
          created_at ASC
      ) AS rn
    FROM public.leads
    WHERE external_entry_key IS NOT NULL
      AND external_entry_key NOT LIKE 'avada_legacy:%'
  ) ranked
  WHERE rn > 1
);

-- 4. Delete the duplicates
DELETE FROM public.leads
WHERE id IN (SELECT id FROM public.leads_predupe_backup_2026_04_29);

-- 5. Unique index to prevent recurrence
CREATE UNIQUE INDEX IF NOT EXISTS leads_form_entry_key_uniq
  ON public.leads (form_id, external_entry_key)
  WHERE external_entry_key IS NOT NULL;

-- 6. Helper index for dedup lookups in upserts
CREATE INDEX IF NOT EXISTS leads_external_entry_key_idx
  ON public.leads (external_entry_key)
  WHERE external_entry_key IS NOT NULL;