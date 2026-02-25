

# Fix Onboarding: RLS Policy Bugs

## The Problem

You're hitting this error when creating an org:
```
new row violates row-level security policy for table "orgs"
```

The root cause is that **three RLS policies are set as RESTRICTIVE instead of PERMISSIVE**. In Postgres, restrictive policies can only narrow access — they can't grant it. Without at least one permissive policy, all operations are denied by default.

Additionally, the `ou_insert` policy on `org_users` has a SQL bug where it compares a column to itself (`org_users_1.org_id = org_users_1.org_id`), which always evaluates to true and breaks the "first member" check.

## What Gets Fixed

### 1. Database migration — fix three RLS policies

| Table | Policy | Issue | Fix |
|-------|--------|-------|-----|
| `orgs` | `org_insert` | RESTRICTIVE, should be PERMISSIVE | Drop and recreate as PERMISSIVE |
| `org_users` | `ou_insert` | RESTRICTIVE + self-referencing bug | Drop and recreate as PERMISSIVE with correct subquery |
| `api_keys` | `ak_insert` | RESTRICTIVE, should be PERMISSIVE | Drop and recreate as PERMISSIVE |

The corrected `ou_insert` policy will allow insert when:
- The user is already an admin of that org, **OR**
- No `org_users` rows exist yet for the given `org_id` (first member bootstrap)

### 2. Onboarding UI — add error feedback

Currently errors are silently caught with `console.error`. The fix adds a toast notification so you can see what went wrong if something fails.

## Technical Details

**Migration SQL:**
```sql
-- Fix orgs insert policy
DROP POLICY IF EXISTS "org_insert" ON public.orgs;
CREATE POLICY "org_insert" ON public.orgs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix org_users insert policy (fix self-join bug)
DROP POLICY IF EXISTS "ou_insert" ON public.org_users;
CREATE POLICY "ou_insert" ON public.org_users
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      user_org_role(org_id) = 'admin'
      OR NOT EXISTS (
        SELECT 1 FROM public.org_users ou2
        WHERE ou2.org_id = org_users.org_id
      )
    )
  );

-- Fix api_keys insert policy
DROP POLICY IF EXISTS "ak_insert" ON public.api_keys;
CREATE POLICY "ak_insert" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (user_org_role(org_id) = 'admin');
```

**Onboarding.tsx change:** Add `toast` import and show error message on failure instead of silent `console.error`.

