ALTER TABLE public.notification_inbox
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;

WITH duplicates AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, lead_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.notification_inbox
  WHERE lead_id IS NOT NULL
)
DELETE FROM public.notification_inbox ni
USING duplicates d
WHERE ni.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_inbox_user_lead_unique
ON public.notification_inbox(user_id, lead_id)
WHERE lead_id IS NOT NULL;