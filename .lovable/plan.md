# Anti-Hacker Hardening Plan (Email 2FA Edition)

Five layers to stop account takeover and data theft. **2FA delivery changed from TOTP/authenticator apps to email codes** per your preference. Everything else unchanged from the prior plan.

---

## What's already in place

- Step-up password re-verification (`admin-step-up`) for sensitive admin actions.
- Support-access grants are HMAC-signed and audited.
- API keys hashed at rest, one-active-key per org.
- Ingestion endpoints have JWT/HMAC verification.
- RLS on across the database.
- Branded email infrastructure with a queue + retry safety, and a `login-2fa-code` email template **already exists** — we will reuse it.

---

## Layer 1 — Block leaked & weak passwords

Enable **HaveIBeenPwned password check** at the auth layer. Any password that has appeared in a known breach is rejected at signup AND password change. Also raise the **minimum length to 12** characters.

## Layer 2 — Mandatory **email 2FA** for admin/owner accounts

Replaces the previous TOTP plan. After password is verified, the user is **not signed in yet** — instead:

1. A 6-digit code is generated server-side, hashed, and stored with a 10-minute expiry.
2. The existing `login-2fa-code` branded email template is sent to the user's verified email.
3. The user enters the code; on success, the session is finalized.
4. Wrong code: 3 attempts, then the challenge is invalidated and a new email is required.
5. **"Trust this device for 30 days"** checkbox issues a long-lived, per-device cookie so you don't get a code on every login from your normal laptop.
6. Code emails are rate-limited: max 5 per email per hour to prevent inbox flooding.

**Why email 2FA is safe enough here:**
- Your email itself is protected by Google's 2FA (you have it enabled).
- The code is single-use, time-bound, and hash-stored.
- The "this wasn't me" alert in Layer 3 fires the moment someone tries.
- No app to install, no recovery codes to lose.

**Scope:** Required for any account with the `admin` role. Regular team members get an opt-in toggle (off by default — they can enable later from `/account`).

## Layer 3 — Email alert on every "risky" auth event

A new `notify-auth-event` edge function emails you the moment any of these happen:

| Event | Why it matters |
|---|---|
| New device / new IP login | First sign of a session hijack |
| Password changed | First thing an attacker does |
| Email address changed | Locks you out of recovery |
| 2FA code requested from a new device | Probe in progress |
| Password reset requested | Inbox probe |
| 5 failed login attempts in 10 min | Brute-force in progress |
| Step-up password verification failed | Someone has your session but not your password |

Each email includes time, IP (geo-located), browser, and a **one-click "this wasn't me — kill all sessions and lock my account"** link that revokes every refresh token, forces password reset, and emails a recovery code.

## Layer 4 — Session hardening

- **Reduce admin refresh-token lifetime** from 1 week → 24 hours. Stolen tokens expire fast.
- **Bind sessions to a user-agent fingerprint hash.** If the JWT is replayed from a wildly different browser, force re-auth.
- New **"Recent sign-ins"** panel on `/account` showing the last 20 sessions (time, IP, device, current/revoked) with **"Revoke this session"** per row plus a **"Sign out everywhere"** button.

## Layer 5 — Password reset & email-change lockdown

1. **Password reset cooldown:** max 3 reset requests per email per hour. Stops attackers from spamming your inbox to bury a real "this wasn't me" warning.
2. **Email-change confirmation on BOTH addresses:** Supabase only confirms the new address by default. We send a "your email is being changed to X — click here to cancel" notice to the **old** address too, with a 1-hour delay before the change takes effect. Even with your session, an attacker can't silently steal the account.

---

## Bonus

- **Admin IP allowlist (optional):** Settings → Security toggle to restrict admin login to specific IPs / CIDR ranges. Off by default.
- **Audit log viewer:** existing `security_audit_log` rows surfaced under `/security`.

---

## What this does NOT change

- Customer (subscriber) WP login flows are untouched.
- API keys, ingest tokens, Stripe webhook flow, HMAC plugin signing — unchanged.
- No breaking changes for normal logins beyond the email-code step on new devices.

---

## Technical sketch

- **Migration:** enable `password_hibp_enabled=true`, raise min length, add tables: `auth_email_2fa_challenges` (id, user_id, code_hash, expires_at, attempts, consumed_at, ip_hash, ua), `trusted_devices` (user_id, device_hash, expires_at), `auth_recent_sessions`, `auth_event_alerts`, `email_change_pending`. Add `revoked_at` to refresh-token tracking.
- **Edge functions:** `request-login-2fa`, `verify-login-2fa`, `notify-auth-event`, `kill-my-sessions`, `confirm-email-change`, `password-reset-rate-limit` guard. All log to `security_audit_log`.
- **Email:** reuse existing `login-2fa-code` transactional template. New transactional templates for the 6 alert types in Layer 3 and the dual email-change confirmation. All routed through the existing branded email queue.
- **Frontend:** post-password 2FA code entry screen at `/auth/verify`, "Trust this device 30 days" checkbox, `/account` "Recent sign-ins" panel, mandatory enrollment redirect for admins (just verifies their email is reachable — no app install), email-change confirmation UX, optional IP allowlist UI.
- All new tables get RLS.

---

## Rollout order

1. **Day 1, no UX impact:** Layer 1 (HIBP + min length), Layer 3 (alert emails), Layer 5 (rate-limit + dual-confirm email change).
2. **Day 2, one-time prompt:** Layer 2 (mandatory admin email 2FA + trusted devices). You'll get a code on your next login from a new device — your current browser will be marked trusted on first verification.
3. **Day 3:** Layer 4 (shorter sessions, fingerprint binding, sessions panel).
4. **Optional:** IP allowlist toggle.

Approve and I'll execute in that order, pausing after Day 1 so you can confirm alert emails are landing before we tighten anything that could lock you out.
