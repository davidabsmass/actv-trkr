-- Single-call lead counts grouped by form for an org. Replaces N parallel
-- exact-COUNT queries from the Forms page (one per form), which was the main
-- cause of slow page loads on accounts with many forms.
CREATE OR REPLACE FUNCTION public.get_lead_counts_by_form(p_org_id uuid)
RETURNS TABLE(form_id uuid, lead_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.form_id, COUNT(*)::bigint AS lead_count
  FROM public.leads l
  WHERE l.org_id = p_org_id
    AND l.status IS DISTINCT FROM 'trashed'
    AND l.form_id IS NOT NULL
    AND (
      public.is_org_member(p_org_id)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  GROUP BY l.form_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_counts_by_form(uuid) TO authenticated;