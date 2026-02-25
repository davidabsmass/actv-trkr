
-- Fix overly permissive orgs INSERT policy
DROP POLICY IF EXISTS "org_insert" ON public.orgs;
CREATE POLICY "org_insert" ON public.orgs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
