CREATE OR REPLACE FUNCTION public.customer_resolve_ticket(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_current_status text;
BEGIN
  SELECT submitted_by_user_id, status
  INTO v_owner, v_current_status
  FROM public.support_tickets
  WHERE id = _ticket_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to resolve this ticket';
  END IF;

  IF v_current_status IN ('resolved', 'closed') THEN
    RETURN;
  END IF;

  UPDATE public.support_tickets
  SET status = 'resolved',
      updated_at = now()
  WHERE id = _ticket_id;

  BEGIN
    INSERT INTO public.support_ticket_events (ticket_id, actor_user_id, kind, detail)
    VALUES (_ticket_id, auth.uid(), 'status_changed', jsonb_build_object('to', 'resolved', 'by', 'customer'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_resolve_ticket(uuid) TO authenticated;