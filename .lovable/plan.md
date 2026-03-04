

## Problem

When an invited user clicks the invite link (`/auth?invite=CODE`), signs up, and then confirms their email, they end up on the **onboarding page** instead of the dashboard. Here's why:

1. User visits `/auth?invite=CODE` and signs up
2. Invite code is saved to `localStorage` as `pending_invite_code`
3. User confirms email via the link in their inbox
4. Email confirmation auto-logs them in — the browser navigates back to the app
5. `AuthRoute` on `/auth` sees an active session and redirects to `/`
6. **The pending invite code is never redeemed** because that only happens inside the login form submit handler
7. `AppLayout` checks orgs → user has none → redirects to `/onboarding`

## Fix

Add invite code redemption logic to **`AppLayout.tsx`** (or a new wrapper) so that when an authenticated user with no orgs loads the app, the system checks `localStorage` for a `pending_invite_code` and redeems it before deciding to redirect to onboarding.

### Changes

**1. `src/components/AppLayout.tsx`** — Add pending invite redemption

Before the `if (!orgs.length)` check, add an effect that:
- Checks `localStorage` for `pending_invite_code`
- If found, calls the `redeem-invite` edge function
- On success, refetches the orgs list (which will now include the invited org)
- Only falls through to onboarding redirect if there's no pending code or redemption fails

This ensures the invite code is redeemed regardless of how the user's session was established (form login, email confirmation redirect, or token refresh).

**2. `src/pages/Auth.tsx`** — Keep existing logic as fallback

The existing `pending_invite_code` check in the login handler stays as a secondary path for users who manually sign in after confirming their email.

