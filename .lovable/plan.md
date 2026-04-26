# Fix "Could not load 2FA status — Auth session missing!" toast

## What's actually happening

You ARE logged in. Auth logs show your `/user` calls returning 200 right around the time of the screenshot. The toast is misleading.

The bug is in `src/components/account/TwoFactorSection.tsx`:

1. The component mounts and immediately calls `supabase.auth.mfa.listFactors()` inside a `useEffect`.
2. There's no guard that waits for the Supabase client to finish restoring the session from local storage (or finish a background token refresh).
3. When `listFactors()` runs in that brief window with no in-memory session, the SDK throws `AuthSessionMissingError: Auth session missing!`.
4. The `catch` block surfaces it as a red toast, even though the next render — once the session hydrates — would have worked fine.

This typically fires right after: a hard refresh on `/account`, returning to the tab after the access token expired, or navigating to Account immediately on app boot.

## The fix

Update `TwoFactorSection.tsx` so it:

1. **Waits for a session before the first `listFactors()` call.**
   - On mount, call `supabase.auth.getSession()` first.
   - If there's no session yet, subscribe to `supabase.auth.onAuthStateChange` and run `refresh()` only after a `SIGNED_IN` / `TOKEN_REFRESHED` / `INITIAL_SESSION` event with a non-null session.
   - Clean up the subscription on unmount.

2. **Treats "Auth session missing" as a non-error retry, not a toast.**
   - In the `catch`, detect `AuthSessionMissingError` (or message includes "Auth session missing") and:
     - Don't show a destructive toast.
     - Schedule one silent retry after ~500ms.
     - If still missing after retry, just leave the panel in its loading/idle state silently — the auth listener above will pick it up when the session arrives.
   - Real errors (network, server) still show the toast as today.

3. **Stops setting `loading=false` prematurely** when we're actually waiting on the session — keep the spinner instead of flashing the "Enable 2FA" CTA based on stale empty state.

## Technical notes

- File touched: `src/components/account/TwoFactorSection.tsx` only. No DB, no edge function, no auth config changes.
- Pattern matches the project's existing rule (per `mem://adding-login-logout` guidance): set up `onAuthStateChange` BEFORE relying on session presence.
- No impact on the actual 2FA enroll/verify/disable flows — those are user-initiated and run after the session is known good.

## What you'll see after the fix

- No more "Could not load 2FA status / Auth session missing!" toast on the Account page.
- The 2FA card will show its loading spinner for a beat longer on cold loads, then render the correct enrolled / not-enrolled state.
- Genuine failures (e.g. network down, Supabase unreachable) will still surface a toast, so you don't lose visibility on real problems.
