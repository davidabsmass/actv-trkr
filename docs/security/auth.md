# Auth & Trust Model

This document explains how the dashboard, the WordPress plugin, and the Supabase backend authenticate to each other, and the guarantees each path makes.

## Trust boundaries

1. **Visitor browser → WP frontend** — pageview tracking, consent banner. No secrets.
2. **WP frontend → edge functions** (`track-pageview`, `track-event`, `ingest-heartbeat`, `ingest-form-batch`, `ingest-security`) — site-scoped *ingest token* (see C-3).
3. **WP admin → edge functions** — admin API key (see C-3).
4. **Edge functions → WP REST** (`generate-wp-login`, `trigger-site-sync`, `avada-debug-proxy`, `provision-signing-secret`, `manage-import-job`, `form-import-watchdog`) — **HMAC-signed** (see C-2). Legacy hash credential is still accepted in v1.18.x for backwards compatibility and is removed in v1.19.0.
5. **Stripe → `actv-webhook`** — `STRIPE_WEBHOOK_SECRET` signature + `event.id` idempotency (see H-7).
6. **Browser dashboard → edge functions** — Supabase JWT.
7. **Buyer (external) → `data-room-access`** — hashed token + max-views + IP rate.

## Magic login (C-1)

Magic-login URLs let an org admin click "Open WP admin" from the dashboard and land on the customer's `/wp-admin` already authenticated.

Hardening (v1.18.0+):

- Token is **minted by the backend**, not the plugin. The plugin no longer trusts a self-issued token.
- Token is bound to:
  - `org_id` of the requesting dashboard user
  - `site_id` being opened
  - `requested_by_user_id` and `requested_by_email`
  - `requestor_ip_hash` and `requestor_user_agent`
- Token is **hashed** at rest (`token_hash` = `sha256(raw)`).
- TTL: **15 minutes**.
- **Atomic single-use**: `UPDATE … WHERE consumed_at IS NULL` race-loss returns `race_lost`.
- Plugin authenticates as the WP user matching `requested_by_email`. If no matching admin exists, the login is **refused and audited**, never falls back to "first admin".
- Every issuance, consumption, and failure writes a row to `security_audit_log` via `log_security_event(...)`. Event types:
  - `magic_login_token_issued`
  - `magic_login_token_consumed`
  - `magic_login_authorization_denied`
  - `magic_login_unknown_token`
  - `magic_login_org_mismatch`
  - `magic_login_replay_attempt`

## Backend → plugin signing (C-2)

Every backend → plugin REST call is HMAC-SHA256 signed.

Headers:

| Header | Value |
| --- | --- |
| `X-Actv-Timestamp` | unix seconds at sign time |
| `X-Actv-Nonce` | 16-byte random hex |
| `X-Actv-Signature` | `hex(hmac_sha256(secret, "ts\n nonce\n body"))` |
| `X-Actv-Key-Id` | optional `api_keys.id` for multi-key rotation |

Verification (`MM_Hmac::verify` in the plugin):

- Timestamp must be within **±300 s** of `time()` (clock-skew tolerance).
- Nonce must be 16–64 hex chars and **unseen** (transient TTL = 600 s).
- Signature is compared with `hash_equals` (constant-time).
- On success, nonce is recorded so a replay returns 401.

The plugin's per-org `signing_secret` is provisioned **once** by the dashboard via `POST /bootstrap-signing-secret` (auth: legacy hash, only this single transitional call). Once stored, the route refuses further bootstrap attempts (`409 already_provisioned`).

### Phased rollout

| Plugin version | Behavior |
| --- | --- |
| `< 1.18.0` | Legacy hash only. No HMAC. |
| `1.18.0 / 1.18.1` | **Dual-accept**: HMAC preferred, legacy hash still works. Backend records which sites still send legacy in `security_audit_log` (`legacy_auth_used`). |
| `1.19.0` | **Signed-only**. Legacy hash returns 401. |

Operators can monitor `legacy_auth_used` events to know when every site has rolled forward and v1.19.0 is safe to ship.

## Stripe webhook idempotency (H-7)

The `actv-webhook` function inserts `event.id` into `processed_stripe_events` **before** doing any side-effects. The PK is `event_id`, so a duplicate insert returns SQL `23505` and the function short-circuits with `200 { received: true, duplicate: true }`. Stripe stops retrying.

This means a single `checkout.session.completed` event can never:

- create the org/user twice
- send the welcome email twice
- double-bill MRR

## Audit log

All auth-relevant events (good and bad) write to `security_audit_log` via `log_security_event(...)`. Fields: `org_id`, `site_id`, `user_id`, `actor_type`, `event_type`, `severity`, `message`, `metadata`, `ip_hash`, `user_agent`, `request_id`. IPs are always hashed with the `actv-trkr-ip-salt:` prefix — raw IPs are never stored.
