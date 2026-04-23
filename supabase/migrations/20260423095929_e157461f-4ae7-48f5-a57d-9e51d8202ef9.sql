-- Explicit deny-all policy to make service-role-only intent clear and
-- silence the "RLS enabled, no policy" linter warning.
CREATE POLICY "service_role_only_select"
  ON public.admin_step_up_tokens FOR SELECT
  TO authenticated, anon
  USING (false);

CREATE POLICY "service_role_only_insert"
  ON public.admin_step_up_tokens FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "service_role_only_update"
  ON public.admin_step_up_tokens FOR UPDATE
  TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "service_role_only_delete"
  ON public.admin_step_up_tokens FOR DELETE
  TO authenticated, anon
  USING (false);