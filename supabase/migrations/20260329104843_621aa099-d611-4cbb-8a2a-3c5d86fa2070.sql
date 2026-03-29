-- Add RLS policy to app_config: only service_role (via security definer functions) can read
-- No authenticated user should directly access this table
CREATE POLICY "app_config_deny_all" ON public.app_config
  FOR ALL
  TO authenticated, anon
  USING (false);