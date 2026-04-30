-- Fix Team RBAC drift: 51 RLS policies still reference the legacy 'member' role.
-- After the Apr 2026 RBAC change, non-admin org users are 'manager', so these
-- policies silently block managers from inserting/updating/deleting their own
-- org's data (e.g. generating reports, editing forms, updating leads, etc.).
-- This migration rewrites every affected public.* policy to use 'manager'.

DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_check TEXT;
  cmd_kw TEXT;
  policy_sql TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND ( (qual::text ILIKE '%''member''%') OR (with_check::text ILIKE '%''member''%') )
  LOOP
    new_qual  := regexp_replace(COALESCE(r.qual,  ''), '''member''', '''manager''', 'g');
    new_check := regexp_replace(COALESCE(r.with_check, ''), '''member''', '''manager''', 'g');

    cmd_kw := CASE r.cmd
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'INSERT' THEN 'INSERT'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
      WHEN 'ALL'    THEN 'ALL'
      ELSE r.cmd::text
    END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    policy_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.policyname,
      r.schemaname,
      r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      cmd_kw,
      array_to_string(r.roles, ', ')
    );

    IF r.qual IS NOT NULL AND new_qual <> '' THEN
      policy_sql := policy_sql || ' USING (' || new_qual || ')';
    END IF;
    IF r.with_check IS NOT NULL AND new_check <> '' THEN
      policy_sql := policy_sql || ' WITH CHECK (' || new_check || ')';
    END IF;

    EXECUTE policy_sql;
  END LOOP;
END $$;

-- Sanity check: there should be zero public policies left referencing 'member'.
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND ( (qual::text ILIKE '%''member''%') OR (with_check::text ILIKE '%''member''%') );
  IF remaining > 0 THEN
    RAISE EXCEPTION 'RBAC migration incomplete: % policies still reference member', remaining;
  END IF;
END $$;