-- Grant admin role to david@absmass.com and set password
INSERT INTO public.user_roles (user_id, role)
VALUES ('8d7ced84-6854-45af-8809-bf24b8ca7ffc', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Set password using pgcrypto bcrypt (auth.users uses bcrypt)
UPDATE auth.users
SET encrypted_password = crypt('TotallyRad76!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '8d7ced84-6854-45af-8809-bf24b8ca7ffc';