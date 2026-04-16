

## Security Hardening Plan

After reviewing the current state, the two previously flagged items are already mitigated:

- **Realtime (`site_tracking_status`)**: Supabase Realtime enforces RLS on `postgres_changes` subscriptions. The existing `sts_select` policy (`is_org_member(org_id)`) already scopes data to the user's organization. No change needed.
- **Storage buckets**: Both `email-assets` and `client-logos` were already locked down in recent migrations (org-scoped uploads/deletes, authenticated-only reads).

### What I will implement

**1. Enable leaked password protection (HIBP)**
Use the `configure_auth` tool to enable the Have I Been Pwned check. This blocks signups and password changes that use known-compromised passwords. No code changes required.

**2. Add a security hardening migration**
- Add RLS policy on `site_tracking_status` for realtime channel authorization (explicit `SELECT` filter by `org_id` on the realtime publication level using Supabase's built-in RLS enforcement — already in place, but we'll add a comment-only migration noting the audit).
- Restrict the `email-assets` bucket SELECT to service-role only (currently any authenticated user can read all email template images; these should only be served by edge functions).

**3. Document security posture**
Save a memory note summarizing the completed audit and current defenses for future reference.

### No changes needed (confirmed secure)
- API key hashing (SHA-256)
- Ingestion rate limiting (IP/site/org)
- Brute force detection (5-attempt lockout)
- File integrity scanning (daily)
- JWT-protected AI endpoints
- Org-scoped RLS on all 85 tables

