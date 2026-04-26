-- Returns a customer-safe view of support activity for an org the caller belongs to.
-- Joins audit log with grants and admin display names so customers can see
-- "who did what when" during temporary access windows, without exposing
-- the full admin profiles table.
CREATE OR REPLACE FUNCTION public.get_support_activity_for_org(_org_id uuid, _limit integer DEFAULT 100)
RETURNS TABLE (
  entry_id uuid,
  grant_id uuid,
  grant_granted_at timestamptz,
  grant_expires_at timestamptz,
  grant_revoked_at timestamptz,
  grant_source text,
  admin_user_id uuid,
  admin_display_name text,
  action text,
  resource_type text,
  resource_id text,
  metadata jsonb,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id            AS entry_id,
    a.grant_id,
    g.granted_at    AS grant_granted_at,
    g.expires_at    AS grant_expires_at,
    g.revoked_at    AS grant_revoked_at,
    g.source        AS grant_source,
    a.admin_user_id,
    -- Redact: show first name only, fall back to a generic label.
    COALESCE(
      NULLIF(split_part(p.full_name, ' ', 1), ''),
      'ACTV TRKR Support'
    )               AS admin_display_name,
    a.action,
    a.resource_type,
    a.resource_id,
    a.metadata,
    a.occurred_at
  FROM public.dashboard_access_audit_log a
  LEFT JOIN public.dashboard_access_grants g ON g.id = a.grant_id
  LEFT JOIN public.profiles p ON p.user_id = a.admin_user_id
  WHERE a.org_id = _org_id
    AND public.is_org_member(_org_id)
  ORDER BY a.occurred_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.get_support_activity_for_org(uuid, integer) TO authenticated;