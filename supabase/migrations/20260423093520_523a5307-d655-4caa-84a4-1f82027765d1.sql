CREATE OR REPLACE FUNCTION public.create_org_with_admin(
  p_org_id uuid,
  p_name text,
  p_timezone text DEFAULT 'America/New_York'::text,
  p_allow_existing boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_org uuid;
BEGIN
  IF p_allow_existing THEN
    SELECT org_id INTO v_existing_org
    FROM public.org_users
    WHERE user_id = auth.uid()
    ORDER BY created_at ASC NULLS LAST, org_id ASC
    LIMIT 1;

    IF v_existing_org IS NOT NULL THEN
      RETURN v_existing_org;
    END IF;
  END IF;

  INSERT INTO public.orgs (id, name, timezone)
  VALUES (p_org_id, p_name, p_timezone);

  INSERT INTO public.org_users (org_id, user_id, role)
  VALUES (p_org_id, auth.uid(), 'admin');

  RETURN p_org_id;
END;
$function$;