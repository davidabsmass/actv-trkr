
CREATE POLICY "leads_delete" ON public.leads
FOR DELETE TO authenticated
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

CREATE POLICY "lff_delete" ON public.lead_fields_flat
FOR DELETE TO authenticated
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));

CREATE POLICY "ler_delete" ON public.lead_events_raw
FOR DELETE TO authenticated
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
