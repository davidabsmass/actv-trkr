## Show invitee email on Set Password screen

Update `src/pages/ResetPassword.tsx` to display a read-only email field above the password inputs so invitees know which account they're setting a password for.

### Changes
- Import `Mail` icon from `lucide-react`.
- Add `accountEmail` state.
- After session is established (PKCE exchange or existing recovery session), call `supabase.auth.getUser()` and store `user.email` in `accountEmail`.
- Render a disabled input above the "New password" field showing the email, with a small helper line "Setting password for this account." Only render when `accountEmail` is present.
- Preserve all existing security guards and the sign-out-on-unmount behavior — no changes to session lifecycle.

### Out of scope
No backend, email template, or auth flow changes.