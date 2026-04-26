-- Allow admins to read sessions for any org (matches the pattern used by
-- support_tickets and dashboard_access_audit_log). Customers' visibility
-- is unchanged — they still only see their own org via is_org_member().
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.sessions'::regclass
      AND polname = 'sess_select_admin'
  ) THEN
    CREATE POLICY sess_select_admin
      ON public.sessions
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- Same for nightly_summaries.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.nightly_summaries'::regclass
      AND polname = 'ns_select_admin'
  ) THEN
    CREATE POLICY ns_select_admin
      ON public.nightly_summaries
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;