-- Per-user read markers for support tickets
CREATE TABLE IF NOT EXISTS public.support_ticket_reads (
  user_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_reads_user
  ON public.support_ticket_reads(user_id);

ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "str_select_own"
  ON public.support_ticket_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "str_insert_own"
  ON public.support_ticket_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "str_update_own"
  ON public.support_ticket_reads FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- View: unread admin replies for the current user
-- Uses security_invoker so existing RLS on support_tickets / support_ticket_messages applies
CREATE OR REPLACE VIEW public.v_my_unread_support_replies
WITH (security_invoker = true) AS
SELECT
  t.id              AS ticket_id,
  t.ticket_number,
  t.subject,
  t.org_id,
  MAX(m.created_at) AS latest_admin_reply_at,
  COUNT(*)::int     AS unread_count
FROM public.support_tickets t
JOIN public.support_ticket_messages m
  ON m.ticket_id = t.id
LEFT JOIN public.support_ticket_reads r
  ON r.ticket_id = t.id
 AND r.user_id   = auth.uid()
WHERE m.author_type = 'admin'
  AND m.is_internal = false
  AND m.created_at > COALESCE(r.last_read_at, t.created_at)
  AND t.submitted_by_user_id = auth.uid()
GROUP BY t.id, t.ticket_number, t.subject, t.org_id;

GRANT SELECT ON public.v_my_unread_support_replies TO authenticated;