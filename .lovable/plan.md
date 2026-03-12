

## Security Fixes

Two error-level findings need to be addressed:

### 1. Invite codes publicly enumerable
The `ic_public_lookup` RLS policy on `invite_codes` allows any unauthenticated user to query all active invite codes, exposing codes and org IDs. This policy is unnecessary -- invite redemption already happens via the `redeem-invite` edge function which uses the service role.

**Fix**: Drop the `ic_public_lookup` policy. No code changes needed.

### 2. Dashboard snapshots publicly readable
The `ds_select_public` policy uses `USING (true)`, making all snapshot data (KPIs, conversion rates, lead volumes) readable by anyone. Snapshots are designed to be shareable via link, but the current policy allows full table enumeration.

**Fix**:
- Drop `ds_select_public` and add an org-member SELECT policy instead
- Create a `get-snapshot` edge function that accepts a snapshot ID, checks expiry, and returns the data (using service role) -- this preserves the shareable link feature without exposing the full table
- Update `SnapshotView.tsx` to call the edge function instead of querying the table directly

### Migration SQL
```sql
-- 1. Drop dangerous invite_codes policy
DROP POLICY IF EXISTS "ic_public_lookup" ON public.invite_codes;

-- 2. Replace dashboard_snapshots public policy with org-scoped one
DROP POLICY IF EXISTS "ds_select_public" ON public.dashboard_snapshots;
CREATE POLICY "ds_select_org" ON public.dashboard_snapshots
  FOR SELECT TO authenticated
  USING (is_org_member(org_id));
```

### New edge function: `get-snapshot`
- Accepts `{ id }` in POST body (no auth required)
- Looks up snapshot by UUID using service role
- Checks `expires_at` server-side
- Returns snapshot data or 404

### Updated `SnapshotView.tsx`
- Call `supabase.functions.invoke("get-snapshot", { body: { id } })` instead of direct table query

