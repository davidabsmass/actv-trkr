-- Security-definer helper: lets any org member check whether THEIR
-- org currently has an active (non-revoked) API key + read non-secret
-- metadata, without granting RLS access to the api_keys table itself.
-- The api_keys.key_hash column remains hidden from non-admin members.

CREATE OR REPLACE FUNCTION public.org_active_api_key_status(_org_id uuid)
RETURNS TABLE (
  has_active_key boolean,
  label text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Caller must be a member of the org. If not, returns "no key" rather
  -- than leaking existence info across orgs.
  WITH membership AS (
    SELECT 1
    FROM public.org_users ou
    WHERE ou.org_id = _org_id
      AND ou.user_id = auth.uid()
    LIMIT 1
  ),
  latest_key AS (
    SELECT k.label, k.created_at
    FROM public.api_keys k
    WHERE k.org_id = _org_id
      AND k.revoked_at IS NULL
    ORDER BY k.created_at DESC
    LIMIT 1
  )
  SELECT
    EXISTS (SELECT 1 FROM latest_key) AS has_active_key,
    (SELECT label FROM latest_key)    AS label,
    (SELECT created_at FROM latest_key) AS created_at
  WHERE EXISTS (SELECT 1 FROM membership);
$$;

GRANT EXECUTE ON FUNCTION public.org_active_api_key_status(uuid) TO authenticated;