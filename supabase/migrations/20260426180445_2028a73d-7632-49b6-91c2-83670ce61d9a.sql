CREATE POLICY "sites_select_admin"
ON public.sites
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));