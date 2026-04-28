## Goal

Make 2FA truly one-or-the-other in the Account page. Today both methods can appear enabled simultaneously (legacy accounts, or if a user enrolled TOTP before the email toggle was added), and the authenticator path uses a button rather than a symmetrical toggle. We'll convert both to matching toggles with hard mutual exclusion enforced in UI + on save.

## Changes — `src/components/account/TwoFactorSection.tsx`

1. **Symmetrical toggles**
   - Email row: keep the `Switch` (already there).
   - Authenticator row: replace the "Set up authenticator app" / "Disable authenticator app" buttons with a `Switch`.
     - Toggling **on** opens the inline QR + 6-digit verify panel below the row (same UI as today, just gated by the toggle instead of a button).
     - Toggling **off** unenrolls the verified TOTP factor (same as `disableTotp` today, with the existing confirm).
     - If the user toggles on, sees the QR, then toggles off without verifying → call `cancelEnroll` (unenrolls the pending factor) and snap the switch back to off.

2. **Hard mutual exclusion**
   - Define a single `setMethod(next: 'none' | 'email' | 'totp')` helper that:
     - If switching to `email`: unenroll any verified TOTP factor first, then upsert `user_two_factor.email_enabled = true`.
     - If switching to `totp`: set `user_two_factor.email_enabled = false` first, then start enrollment. Only flip the persisted state after verify succeeds.
     - If switching to `none`: disable whichever is currently on.
   - Replace the current `handleEnableEmail` / `handleStartTotp` with this helper so both paths go through the same guard.
   - Disable the *other* method's switch while one is mid-action (`busy || emailToggling || !!enroll`).

3. **Reconcile legacy "both on" state on load**
   - In `refresh()`, after we know `totpEnrolled` and `emailEnabled`, if **both** are true treat TOTP as the winner (stronger method) and silently set `email_enabled = false` in `user_two_factor`. Toast: "Email 2FA was turned off because your authenticator app is active." This guarantees nobody lands on the page with two "On" badges again.

4. **Copy tweaks**
   - Card description stays: "Pick one method — emailed code or authenticator app."
   - When TOTP is on, dim the email row's helper text to "Disabled while authenticator app is active" (and vice versa) so it's obvious why one switch is locked.

## Out of scope

- No DB schema changes (`user_two_factor` already has what we need).
- No changes to the sign-in challenge flow — only the Account page UI/state.
- No plugin changes (2FA is dashboard-only, as confirmed earlier).

## Files touched

- `src/components/account/TwoFactorSection.tsx` (only)