
-- Add archived column to forms
ALTER TABLE public.forms ADD COLUMN archived boolean NOT NULL DEFAULT false;

-- Allow admins/members to update forms (needed for archiving and other settings)
CREATE POLICY "forms_update" ON public.forms FOR UPDATE
USING (user_org_role(org_id) = ANY (ARRAY['admin'::text, 'member'::text]));
