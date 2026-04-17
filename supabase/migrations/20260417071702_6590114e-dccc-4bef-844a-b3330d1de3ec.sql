-- 1. Re-attach the missing handle_new_user trigger so future signups get a profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill missing profiles for any existing auth.users
INSERT INTO public.profiles (user_id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- 3. Clean up orphaned user_roles row from previously deleted user
DELETE FROM public.user_roles
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- 4. Grant david@newuniformdesign.com admin role + add him to New Uniform org
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'david@newuniformdesign.com';
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.org_users (org_id, user_id, role)
    VALUES ('8e02f31e-32a8-4843-8595-f2cc7cc216c6', v_uid, 'admin')
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'admin';
  END IF;
END $$;