-- Atomic API key replacement: revoke ALL existing active keys for the org
-- and insert the new one in a single transaction. Guarantees the old key
-- can never be used again once a replacement is generated.

CREATE OR REPLACE FUNCTION public.replace_org_api_key(
  _org_id uuid,
  _new_key_hash text,
  _label text DEFAULT 'Plugin Key'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
BEGIN
  -- Caller must be a member of the org
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  IF _new_key_hash IS NULL OR length(_new_key_hash) < 32 THEN
    RAISE EXCEPTION 'invalid_key_hash' USING ERRCODE = '22023';
  END IF;

  -- Atomically revoke every currently-active key for this org
  UPDATE public.api_keys
     SET revoked_at = now()
   WHERE org_id = _org_id
     AND revoked_at IS NULL;

  -- Insert the new key
  INSERT INTO public.api_keys (org_id, key_hash, label)
  VALUES (_org_id, _new_key_hash, COALESCE(NULLIF(_label, ''), 'Plugin Key'))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_org_api_key(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_org_api_key(uuid, text, text) TO authenticated;