DROP POLICY IF EXISTS "No direct client access to password reset links" ON public.password_reset_links;

CREATE POLICY "No direct client access to password reset links"
ON public.password_reset_links
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);