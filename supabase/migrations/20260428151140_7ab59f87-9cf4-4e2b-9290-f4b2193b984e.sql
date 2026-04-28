-- Drop existing role CHECK constraint and replace with admin/manager only
ALTER TABLE public.org_users DROP CONSTRAINT IF EXISTS org_users_role_check;

ALTER TABLE public.org_users
  ADD CONSTRAINT org_users_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text]));

-- Change default for new rows from viewer to manager
ALTER TABLE public.org_users ALTER COLUMN role SET DEFAULT 'manager';