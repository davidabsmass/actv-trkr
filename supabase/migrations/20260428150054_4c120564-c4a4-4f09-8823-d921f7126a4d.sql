
CREATE TABLE IF NOT EXISTS public.user_two_factor (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_two_factor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own 2fa settings"
ON public.user_two_factor FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own 2fa settings"
ON public.user_two_factor FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own 2fa settings"
ON public.user_two_factor FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_two_factor_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_two_factor_touch ON public.user_two_factor;
CREATE TRIGGER user_two_factor_touch
BEFORE UPDATE ON public.user_two_factor
FOR EACH ROW EXECUTE FUNCTION public.touch_user_two_factor_updated_at();
