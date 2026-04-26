WITH duplicates AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, alert_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.notification_inbox
  WHERE alert_id IS NOT NULL
)
DELETE FROM public.notification_inbox ni
USING duplicates d
WHERE ni.id = d.id
  AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_inbox_user_alert_unique
ON public.notification_inbox(user_id, alert_id)
WHERE alert_id IS NOT NULL;