
ALTER TABLE public.security_events ADD COLUMN reviewed_at timestamptz DEFAULT NULL;

CREATE POLICY "se_update_member" ON public.security_events
  FOR UPDATE TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));
