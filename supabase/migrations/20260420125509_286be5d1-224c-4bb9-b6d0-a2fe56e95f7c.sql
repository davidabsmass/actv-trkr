-- Revoke all active API keys for livesinthebalance.org
UPDATE public.api_keys
SET revoked_at = NOW()
WHERE org_id IN (
  SELECT id FROM public.orgs WHERE name ILIKE '%livesinthebalance%'
)
AND revoked_at IS NULL;

-- Delete all API keys (revoked and active) for livesinthebalance.org
DELETE FROM public.api_keys
WHERE org_id IN (
  SELECT id FROM public.orgs WHERE name ILIKE '%livesinthebalance%'
);

-- Audit log entries
INSERT INTO public.deletion_audit (org_id, action, details)
SELECT id, 'admin_revoke_all_keys', jsonb_build_object('org_name', name, 'reason', 'Manual cleanup - livesinthebalance.org')
FROM public.orgs WHERE name ILIKE '%livesinthebalance%';