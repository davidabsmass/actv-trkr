CREATE OR REPLACE FUNCTION public.admin_wipe_org_chunk(
  p_org_id uuid,
  p_table text,
  p_batch_size integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
  v_has_org_id boolean;
  v_deleted bigint := 0;
  v_remaining bigint := 0;
BEGIN
  -- Per-statement budget well under any reasonable HTTP timeout.
  PERFORM set_config('statement_timeout', '60000', true);

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'missing', 'deleted', 0, 'remaining', 0, 'done', true);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'org_id'
  ) INTO v_has_org_id;
  IF NOT v_has_org_id THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_org_id', 'deleted', 0, 'remaining', 0, 'done', true);
  END IF;

  EXECUTE format(
    'WITH d AS (SELECT ctid FROM public.%I WHERE org_id = $1 LIMIT %s) DELETE FROM public.%I t USING d WHERE t.ctid = d.ctid',
    p_table, p_batch_size, p_table
  ) USING p_org_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', p_table)
    USING p_org_id INTO v_remaining;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'remaining', v_remaining,
    'done', v_remaining = 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_org_record(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count bigint;
BEGIN
  PERFORM set_config('statement_timeout', '30000', true);
  DELETE FROM public.orgs WHERE id = p_org_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_count);
END;
$function$;