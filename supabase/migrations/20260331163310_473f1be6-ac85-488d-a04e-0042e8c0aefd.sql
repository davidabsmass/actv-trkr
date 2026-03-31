
-- Add dedicated external_entry_id column to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS external_entry_id text;

-- Backfill from JSONB data column
UPDATE public.leads
SET external_entry_id = data->>'external_entry_id'
WHERE external_entry_id IS NULL
  AND data->>'external_entry_id' IS NOT NULL
  AND data->>'external_entry_id' != '';

-- Create index for fast lookups during sync
CREATE INDEX IF NOT EXISTS idx_leads_external_entry_id ON public.leads (org_id, form_id, external_entry_id) WHERE external_entry_id IS NOT NULL;
