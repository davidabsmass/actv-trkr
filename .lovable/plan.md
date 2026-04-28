## Problem

On `Account → Security → Change password`, two issues:

1. **Fields prepopulate.** The browser/password manager autofills the saved password into "New password" and "Confirm password" because the inputs have no `autocomplete` hints and no distinguishing `name` attributes. So if anyone opens that page on a logged-in browser, the new password is already filled in — one click away from being changed.
2. **No second factor on the change.** Today the flow is just `supabase.auth.updateUser({ password })` — anyone with an open session (stolen laptop, shared browser, session hijack) can reset the password and lock the real owner out. We only send a *notification* email after the fact.

## Fix

### Part A — Stop the autofill (UI hardening, `src/pages/Account.tsx`)

On both password `<Input>`s on the Change Password card:
- `autoComplete="new-password"`
- `name="new-password"` / `name="confirm-new-password"`
- `spellCheck={false}`, `autoCorrect="off"`, `autoCapitalize="off"`
- Add a hidden honeypot `<input type="password" autoComplete="current-password" tabIndex={-1} className="hidden" aria-hidden />` above the real fields so password managers fill *that* one instead of the new ones (standard pattern, same trick already used on `ResetPassword.tsx`).
- Wrap the two inputs + button in a real `<form onSubmit>` with `autoComplete="off"` so Chrome respects the hint.
- Clear both fields in a `useEffect` on mount (defensive — if the browser ignores the hint, we wipe state right after paint).

### Part B — Require email confirmation before the password actually changes

New flow when the user clicks **Update password**:

1. Client validates length + match (as today).
2. Client calls a new edge function `request-password-change` with `{ newPassword }` over the user's authenticated session (JWT).
3. Edge function:
   - Verifies JWT, loads the user.
   - Generates a one-time `confirm_token` (32-byte random, hex) and a `cancel_token`.
   - Hashes both (SHA-256) and stores in a new `pending_password_changes` table:
     `id, user_id, new_password_hash (bcrypt of new pwd), confirm_token_hash, cancel_token_hash, requested_at, expires_at (now + 30 min), confirmed_at, cancelled_at, requested_ip, requested_ua`.
   - Sends a transactional email "Confirm your password change" to the user's current email with two links:
     - Confirm: `https://app/confirm-password-change?token=<confirm>&pid=<id>`
     - Cancel: `https://app/cancel-password-change?token=<cancel>&pid=<id>` ("If you didn't request this, click here — your password will NOT change and we'll lock the request.")
   - Returns `{ ok: true }` to the UI. The UI shows: *"Check your inbox — we sent a confirmation link to `you@example.com`. Your password will only change after you click that link. The link expires in 30 minutes."* The fields are cleared.
4. New page `/confirm-password-change` calls `confirm-password-change` edge function with the token + pid. Edge function:
   - Hashes the token, looks up the pending row, verifies it isn't expired, used, or cancelled.
   - Calls Supabase Admin API `auth.admin.updateUserById(user_id, { password: <decrypted new pwd> })`.
   - Marks `confirmed_at`, fires the existing `notify-account-event` `password_changed` alert (security-alert email).
   - Forces global sign-out (`auth.admin.signOut(user_id, 'global')`) so any stolen session is killed.
   - Page then redirects to `/auth?reason=password_updated`.
5. New page `/cancel-password-change` calls `cancel-password-change` edge function (public — token-gated) which marks the row `cancelled_at` and fires a "password change request was cancelled" alert.

### Part C — Storage of the pending new password

We can't store the new plaintext password at rest. Two safe options — **proposed: option 1**.

- **Option 1 (recommended): encrypt the new password with a server-side key from `pending_password_change_key` in Vault.** Decrypt only inside the confirm function. Row is hard-deleted on confirm/cancel and after expiry by a daily cron.
- Option 2: don't store the new password at all — the confirm link takes the user to a one-time form where they re-enter the new password. Slightly safer, but worse UX (they type it twice, 30 min apart).

If you prefer option 2, say so and I'll swap it.

## Technical details

**Files changed:**
- `src/pages/Account.tsx` — autofill hardening + new "request" flow + success state.
- `src/pages/ConfirmPasswordChange.tsx` (new) — calls confirm function on mount.
- `src/pages/CancelPasswordChange.tsx` (new) — calls cancel function on mount.
- `src/App.tsx` — register the two new public routes.

**Edge functions (new, all `verify_jwt = false` except step 1):**
- `request-password-change` — JWT-required; creates pending row, sends email.
- `confirm-password-change` — public, token-gated; applies the change.
- `cancel-password-change` — public, token-gated; voids the request.

**DB migration:**
- New table `public.pending_password_changes` with RLS denying all client access (only service role reads/writes).
- Daily `pg_cron` job that deletes rows where `expires_at < now() - interval '7 days'` (kept short for audit, then purged).

**Email template:**
- New transactional template `password-change-confirm` registered in the existing transactional registry, branded to match `password_changed` security alert.

**Backward compatibility:**
- The existing `notify-account-event { password_changed }` security-alert email keeps firing — but now from the *confirm* function, after the change actually lands.

## Out of scope (call out for your decision)

- I'm not adding TOTP/2FA *as a requirement* for password change — only email confirmation. If you want "if user has authenticator 2FA enabled, require a TOTP code instead of / in addition to the email link", tell me and I'll fold that in (it's a small addition on top of this plan).
