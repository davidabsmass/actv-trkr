
-- Atomic invite code increment function
CREATE OR REPLACE FUNCTION public.increment_invite_use(p_invite_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.invite_codes
  SET use_count = use_count + 1
  WHERE id = p_invite_id;
$$;

-- Rate limits table for DB-backed rate limiting
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, function_name)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed — only accessed via service role from edge functions

-- Fix email-assets storage bucket: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "email_assets_select_by_path" ON storage.objects;
CREATE POLICY "email_assets_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'email-assets');
