-- Lock down plugin_release_keys: only admins (and service role) can read.
DROP POLICY IF EXISTS "Authenticated users can view active release keys" ON public.plugin_release_keys;

CREATE POLICY "Admins can view release keys"
ON public.plugin_release_keys
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));