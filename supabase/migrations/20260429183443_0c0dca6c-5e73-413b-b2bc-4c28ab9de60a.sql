ALTER TABLE public.leads_predupe_backup_2026_04_29 ENABLE ROW LEVEL SECURITY;
-- No policies = no access for authenticated/anon users. Service role bypasses RLS.
REVOKE ALL ON public.leads_predupe_backup_2026_04_29 FROM anon, authenticated;