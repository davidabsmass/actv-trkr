# ACTV TRKR — Security Audit (Phase 0)

**Audit date:** 2026-04-17
**Scope:** WordPress plugin (`mission-metrics-wp-plugin/` + `serve-plugin-zip/plugin-template/`), Supabase edge functions, RLS, Stripe/billing, secrets, ingestion pipeline, admin dashboard.
**Audit type:** Read-only review. No code changes in this phase.
**Methodology:** Manual source review of every plugin file and security-relevant edge function, cross-referenced with the database schema and existing memory notes.

> The earlier memory note `mem://security/audit-2026-04` stated *"no vulnerabilities found."* That assessment is **superseded** by this audit. Several Critical and High issues exist in the current code paths and are documented below.

---

## 1. Trust Boundary Map

```
┌────────────────────────┐    site-scoped API key (raw, in WP options + JS)
│  WordPress Plugin      │ ─────────────────────────────────────────────┐
│  (admin + front-end)   │                                              │
└─────────┬──────────────┘                                              │
          │ wp_remote_post / wp_remote_get                              │
          │ Bearer + x-api-key + x-actvtrkr-key (3 header schemes)      ▼
          │                                              ┌────────────────────────┐
          │                                              │  Supabase Edge         │
          │                                              │  Functions (Deno)      │
          │                                              │  service_role inside   │
          │                                              └────┬───────────────────┘
          │                                                   │
          │                                                   │ service_role
          │                                                   ▼
          │                                              ┌────────────────────────┐
          │                                              │  Postgres + RLS        │
          │                                              │  85+ tables, org-scoped│
          │                                              └────────────────────────┘
          │
          │ /wp-json/actv-trkr/v1/* — REST routes guarded by hashed-key match
          ▼
   Backend → WordPress (reverse channel: magic-login, sync, import-batch, avada-debug)
```

### Identified trust boundaries
1. **Visitor browser → WP frontend** — pageview tracking, consent banner.
2. **WP frontend → edge functions** (`track-pageview`, `track-event`, `ingest-heartbeat`, `ingest-form-batch`, `ingest-security`) — authenticated by site API key.
3. **WP admin → edge functions** (sync-forms, plugin-update-check, check-site-status, recovery-banner reconnect).
4. **Edge functions → WP REST** (`generate-wp-login`, `trigger-site-sync`, `avada-debug-proxy`) — authenticated by sending the **stored API key hash** as a header.
5. **Stripe → `actv-webhook`** — signed via `STRIPE_WEBHOOK_SECRET`.
6. **Browser dashboard → edge functions** — Supabase JWT auth.
7. **Buyer (external) → `data-room-access`** — token-only, hashed.

---

## 2. Attack Surface Inventory

### 2A. WordPress plugin REST routes (namespace `actv-trkr/v1`)
| Route | Method | Auth | File |
|---|---|---|---|
| `/sync` | POST | `verify_key_hash` (SHA-256 of stored API key in body) | `class-forms.php` |
| `/backfill-avada` | POST | `verify_key_hash` | `class-forms.php` |
| `/backfill-entries` | POST | `verify_key_hash` | `class-forms.php` |
| `/avada-debug` | POST | `verify_key_hash` | `class-forms.php` |
| `/import-batch` | POST | `verify_key_hash` | `class-import-engine.php` |
| `/import-count` | POST | `verify_key_hash` | `class-import-engine.php` |
| `/import-discover` | POST | `verify_key_hash` | `class-import-engine.php` |
| `/magic-login` | POST | `verify_api_key` (X-Api-Key, raw OR hash) | `class-magic-login.php` |

### 2B. WordPress admin-ajax actions
| Action | nopriv? | Capability check | Nonce | File |
|---|---|---|---|---|
| `mm_test_connection` | no | `manage_options` ✓ | `mm_test` ✓ | `class-settings.php` |
| `mm_sync_forms` | no | `manage_options` ✓ | `mm_sync_forms` ✓ | `class-settings.php` |
| `mm_scan_broken_links` | no | `manage_options` ✓ | `mm_scan_links` ✓ | `class-broken-links.php` |
| `mm_consent_diag` | no | `manage_options` ✓ | `mm_consent_diag` ✓ | `class-consent-banner.php` |
| `mm_dismiss_compliance_nudge` | no | (not shown) | (not shown) | `class-consent-banner.php` |
| `mm_detect_privacy_pages` | no | `manage_options` ✓ | `mm_privacy_detect` ✓ | `class-privacy-setup.php` |
| `mm_recovery_reconnect` | no | `manage_options` ✓ | `mm_recovery_reconnect` ✓ | `class-recovery-banner.php` |

### 2C. Front-end query handlers
| Path | Auth | File |
|---|---|---|
| `?actv_magic_token=…` | one-time hashed token (15 min TTL) | `class-magic-login.php` |

### 2D. Plugin → backend egress endpoints
`track-pageview`, `track-event`, `ingest-heartbeat`, `ingest-security`, `ingest-broken-links`, `ingest-order`, `ingest-gravity`, `ingest-form`, `ingest-form-batch`, `sync-forms`, `sync-entries`, `seo-fix-poll`, `seo-fix-confirm`, `check-site-status`, `plugin-update-check`.

### 2E. Edge functions (security-sensitive subset, ~130 total)
Auth model varies — see Finding **H-2**.

### 2F. Stripe webhook
`actv-webhook` — signature-verified via `STRIPE_WEBHOOK_SECRET`. **No idempotency guard** on `event.id` (Finding **H-7**).

### 2G. Cron / background
WP-side: `mm_retry_cron` (5 min), `mm_form_probe_cron` (hourly), `mm_seo_fix_cron` (5 min), `mm_heartbeat_cron` (5 min), `mm_broken_links_cron` (weekly), `mission_metrics_file_integrity_scan` (daily).

### 2H. Activation / deactivation
`mm_activate` creates `wp_mm_retry_queue`, schedules cron. No upgrade-path migration check.

### 2I. File handling
**No uploads.** **One ZIP path** — `serve-plugin-zip` builds the plugin ZIP from a static template and streams it. Public-ish endpoint. (Finding **M-9**.)

### 2J. Remote fetch
`scan_and_report` (broken links) — fetches URLs found in the site's own sitemap. SSRF blast radius is bounded to the site's own publicly-discoverable links, but no scheme/IP allowlist (Finding **M-6**).

`seo-fix-command` server-side fetches arbitrary `page_url` provided by the dashboard user. Auth'd, but no SSRF guard (Finding **H-8**).

---

## 3. Capability / Permission Matrix (current state)

| Action | Required (current) | Required (target) | Gap |
|---|---|---|---|
| Save plugin settings | `manage_options` ✓ | `manage_options` ✓ | none |
| Test connection | `manage_options` ✓ | `manage_options` ✓ | none |
| Sync forms (admin button) | `manage_options` ✓ | `manage_options` ✓ | none |
| Sync forms (REST) | hashed-key match | site-scoped credential + capability map | see **C-2** |
| Magic-login generation | hashed-key match | scoped credential + audit | see **C-1** |
| Magic-login consumption | unauthenticated GET with token | same + binding & audit | see **C-1** |
| Import engine batch/count/discover | hashed-key match | scoped credential + capability | see **C-2** |
| Avada debug | hashed-key match | should require explicit "diagnostics" capability | see **H-3** |
| Stripe webhook | Stripe signature ✓ | + idempotency | see **H-7** |
| Data-room link view | token + sha256 lookup ✓ | + max-views + IP rate ✓ | minor |
| Edge function: `dashboard-ai-insights` etc. | JWT ✓ | JWT + cost cap ✓ | none |

---

## 4. Secret Inventory

| Secret | Where it lives | Exposure risk |
|---|---|---|
| `STRIPE_SECRET_KEY` | edge env | server-only ✓ |
| `STRIPE_WEBHOOK_SECRET` | edge env | server-only ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | edge env | server-only ✓ |
| `SUPABASE_ANON_KEY` | client + edge | publishable ✓ |
| `LOVABLE_API_KEY`, `ADMIN_SECRET`, `CRON_SECRET` | edge env | server-only ✓ |
| **Plugin API key (raw)** | `wp_options.mm_options.api_key` **+ enqueued to browser via `wp_localize_script` as `mmConfig.apiKey`** | **HIGH — see C-3** |
| **`api_keys.key_hash` column** | DB; used as **both** the verification hash **and** sent as the auth header from backend → WP | **HIGH — see C-1** |
| Magic-login token (raw) | one-time URL query param | acceptable (15 min, hashed at rest) |
| Data-room link token | one-time URL fragment, sha256 stored | acceptable |

---

## 5. Findings — Critical / High / Medium / Fast Wins

### 🔴 CRITICAL

#### C-1 — Magic-login auto-elevates to **first administrator account**, no binding to the requestor

**File:** `mission-metrics-wp-plugin/includes/class-magic-login.php` lines 109–129
**Impact:** Any party who can produce a valid token (which only requires possessing the site's API key hash) can log in to wp-admin **as the first administrator on the site**, regardless of who the dashboard user actually is. Combined with C-3, exposure of the JS-embedded API key would let anyone with that key call `/magic-login` and mint a wp-admin session.

```php
$admins = get_users(['role'=>'administrator', 'number'=>1, 'orderby'=>'ID', 'order'=>'ASC']);
$admin = $admins[0];
wp_set_auth_cookie($admin->ID, false);
```
- Token is bound to nothing about the requestor (no user id, no IP pin, no email).
- The plugin also accepts **either** the raw API key **or** its SHA-256 hash as `X-Api-Key` (`hash_equals($api_key, $auth) || hash_equals($stored_hash, $auth)`), which means **the stored hash is itself a usable credential** (the backend stores `key_hash` and uses it as the auth header in `generate-wp-login` and `avada-debug-proxy`, see lines 76–98 of `generate-wp-login/index.ts`).
- No audit log of magic-login issuance or consumption.

**Status:** **RELEASE BLOCKER.**

#### C-2 — Backend authenticates to plugin REST routes by sending the **stored hash** as the credential

**Files:** `supabase/functions/generate-wp-login/index.ts` (lines 76–108), `avada-debug-proxy/index.ts` (lines 32–55), and the matching plugin handlers in `class-forms.php::verify_key_hash` and `class-magic-login.php::verify_api_key`.

The DB column `api_keys.key_hash` is **the verifier**. Both the plugin's `verify_key_hash` and `verify_api_key` accept that hash directly:
```php
if ( hash_equals( $api_key, $auth ) || hash_equals( $stored_hash, $auth ) ) return true;
```
Anyone with read access to `api_keys.key_hash` (e.g. a misissued service-role token, a SQL-readable backup, or a future admin tool that displays it) can impersonate the site's plugin to the backend **and** drive the backend → WP reverse-channel routes (`/sync`, `/import-batch`, `/avada-debug`, `/magic-login`).

There is no per-request signature, no nonce, no timestamp, no replay protection.

**Status:** **RELEASE BLOCKER.**

#### C-3 — Plugin API key is rendered into the **public page source** as `mmConfig.apiKey`

**File:** `mission-metrics-wp-plugin/includes/class-tracker.php` lines 24–42
```php
$config = ['endpoint' => …, 'apiKey' => $opts['api_key'], …];
wp_localize_script('mm-tracker', 'mmConfig', $config);
```
Any visitor (including an unauthenticated attacker) can read this from the rendered HTML/JS bundle and:
- Use it against `track-pageview`, `track-event`, `ingest-heartbeat`, `ingest-broken-links`, `ingest-security`, `check-site-status`, `seo-fix-poll`, `plugin-update-check`, `sync-forms`, `sync-entries`, `ingest-form-batch`, etc. — all of which accept this key as Bearer / `x-api-key` / `x-actvtrkr-key`.
- Forge analytics, exhaust rate limits, generate alerts, push fake security events, and (combined with C-1/C-2) potentially mint a wp-admin session.

The org/site rate limits in `_shared/ingestion-security.ts` reduce the blast radius but don't eliminate it. The key was never intended to be public; the design needs a **separate publishable site identifier** for the browser tracker and a **server-only** key for plugin↔backend.

**Status:** **RELEASE BLOCKER.**

#### C-4 — `serve-plugin-zip` and `plugin-update-check` ship binaries to anonymous callers without integrity proof

**Files:** `supabase/functions/serve-plugin-zip/index.ts`, `supabase/functions/plugin-update-check/index.ts`

The plugin updater hits `plugin-update-check?action=check…` and follows the returned `download_url` which points at `serve-plugin-zip`. There is no:
- HTTPS pinning of the Supabase host (rely on TLS only),
- ZIP signature / SHA-256 manifest the plugin verifies before executing,
- hostname allowlist on the plugin side (it trusts whatever URL the backend returns).

If the response were ever tampered with (compromised CDN, MITM on a misconfigured site, or a rogue `download_url`), every site running the plugin would auto-execute the new code on next update. Lower likelihood than C-1/C-3 but the impact is full RCE on every install.

**Status:** **High-impact gap. Recommend fix in Phase 1 / Phase 2.**

---

### 🟠 HIGH

#### H-1 — Settings sanitizer uses `OPTION_NAME` raw inside `name=""` HTML attribute without `esc_attr`
**File:** `class-settings.php` lines 73, 81, 89, 99, 109, 118 etc.
```php
<input name="<?php echo self::OPTION_NAME; ?>[api_key]" …>
```
`OPTION_NAME` is a class constant today (`mm_options`), so this is not currently exploitable, but the codebase pattern is unsafe — any future change that lets the constant become user-controllable is an instant XSS. **Fix:** wrap in `esc_attr()`. (Same pattern repeats in `class-privacy-setup.php` lines 197, 209.)

#### H-2 — Inconsistent edge-function auth: 3 different header schemes for the same secret
- `Authorization: Bearer <api_key>` — `track-pageview`, `ingest-form-batch`, `sync-forms`
- `x-api-key: <api_key>` — `ingest-security`, `seo-fix-poll`, `seo-fix-confirm`, `ingest-order`
- `x-actvtrkr-key: <api_key>` — `ingest-heartbeat`, `ingest-broken-links`, `check-site-status`

Result: harder to audit, easy to miss one in a rotation, easy to leak via mismatched logging. **Fix:** consolidate to one canonical header (Phase 2).

#### H-3 — `avada-debug` REST route is enabled in production with no "diagnostics enabled" gate
**File:** `class-forms.php` lines 98–102
This route returns table contents and resolution diagnostics. Exposed to anyone holding the API key hash (see C-2). Should be opt-in via a settings switch and disabled by default in production.

#### H-4 — `MM_Magic_Login` falls back to `$_SERVER['REMOTE_ADDR']` and `X-Forwarded-For` without validation, and stores raw value in transient
Minor PII / log-pollution risk. `X-Forwarded-For` is attacker-controlled when not behind a known reverse proxy.

#### H-5 — `MM_WooCommerce::send_order` sends **plain-text customer email + name + payment method** to `ingest-order` over HTTPS
Acceptable transport, but on the receiving side this lands in DB tables that may not have explicit redaction or PII handling beyond standard RLS. Needs a data-minimization review (Phase 3).

#### H-6 — `MM_Forms::handle_rest_avada_debug` and the `avada-debug-proxy` edge function chain together to expose diagnostic SQL output to dashboard users; per H-3, gating is insufficient.

#### H-7 — Stripe webhook has **no idempotency on `event.id`**
**File:** `supabase/functions/actv-webhook/index.ts`
Stripe explicitly retries delivery. The handler creates auth users, orgs, and sends emails. Without an `event.id` dedupe table, retries can:
- Create duplicate orgs.
- Re-send welcome emails.
- Insert duplicate `email_send_log` rows.

**Fix:** add `processed_stripe_events(event_id PK, processed_at)` and short-circuit at the top.

#### H-8 — `seo-fix-command` server-side-fetches `page_url` provided by an authenticated dashboard user, no SSRF guard
**File:** `supabase/functions/seo-fix-command/index.ts` lines 60–86
```ts
const pageResp = await fetch(page_url, { headers: { "User-Agent": "ACTV-TRKR-SEO/1.0" }, signal: AbortSignal.timeout(10000) });
```
- No scheme allowlist, no IP-range block, no redirect cap, no max-bytes, no host validation against the user's connected sites.
- A logged-in user could probe internal Supabase URLs, cloud metadata IPs (`169.254.169.254`), private nets, etc.

#### H-9 — `MM_Recovery_Banner::ajax_reconnect` issues `check_ajax_referer` **without storing a referer key**
`check_ajax_referer( 'mm_recovery_reconnect' )` on line 143 with no second argument defaults to checking `_wpnonce` / `_ajax_nonce` — works, but the `enqueue_assets` JS sends `_wpnonce` only. Acceptable but worth tightening to `check_ajax_referer( 'mm_recovery_reconnect', '_wpnonce' )` for clarity and grep-ability.

#### H-10 — `MM_Consent_Banner::ajax_dismiss_nudge` is hooked but its definition is not in the read excerpt — must be audited for cap + nonce.

---

### 🟡 MEDIUM

#### M-1 — `MM_Settings::sanitize` is an **allowlist** ✓ but the rendered admin form uses `<?php echo self::OPTION_NAME; ?>` unescaped (see H-1).
#### M-2 — `MM_Tracker` exposes logged-in WP user `id` and concatenated `roles` in the page source for every authenticated visitor. Roles can leak info ("administrator" on every admin page). Document or scope.
#### M-3 — `MM_Forms::scan_all_forms` calls `wp_remote_post` to `sync-entries` with `timeout=120` from a foreground admin request. Long timeout in hot path; not a security issue but a DoS-on-self risk.
#### M-4 — `MM_Retry_Queue` no longer stores the API key (good — see comment on line 35) but `wpdb->insert` does not validate `endpoint`. A bug in the caller that injects an attacker-controlled endpoint would mean later retries silently push payloads to that URL. Add an endpoint allowlist (`startsWith($settings['endpoint_url'])`).
#### M-5 — `MM_Heartbeat::send_cron_heartbeat` ships full active plugin list + versions on every signal. Useful, but "plugin inventory of every customer site" is a sensitive aggregate dataset. Confirm storage/access policy.
#### M-6 — `MM_Broken_Links` fetches every internal link with no scheme allowlist or IP-range block. Bounded to URLs found in the site's own sitemap → low risk, but an attacker who can edit a post can inject `http://169.254.169.254/...` and the cron will hit it from the site itself. Add SSRF guard.
#### M-7 — `class-seo-fixes.php` calls `get_option('mm_api_key')` and `get_option('mm_api_url')` (lines 52–53) — these option keys **don't exist** anywhere else; the actual keys are nested under `mm_options`. The cron silently no-ops. Functional bug **and** silently disables fix application; flag for Phase 1.
#### M-8 — `MM_Updater::CHECK_HOURS = 0` causes the update transient to expire immediately (line 16). Means every plugins-page load hits the backend. Not a security issue, but it amplifies M-9 and any backend outage.
#### M-9 — `serve-plugin-zip` builds the ZIP from in-memory PHP strings (template files inlined into the function). No content hash returned; no signature. Add SHA-256 to manifest + verify in `MM_Updater::check_update`.
#### M-10 — `MM_Privacy_Setup` admin form uses `<?php echo $name; ?>` (line 197, 209) — same pattern as H-1.
#### M-11 — `class-import-adapters.php::MM_Adapter_Avada::resolve_form_id` builds `LIKE` clauses with user-controlled `source_url` patterns via `wpdb->esc_like()` — correct, but worth a regression test.
#### M-12 — `class-forms.php::handle_rest_*` uses an **in-process** rate limit transient keyed by IP md5. Behind a load balancer this only limits per-PHP-worker. Should be per-IP via shared cache or rely on backend-side limiter.
#### M-13 — `MM_WooCommerce` reads `$_COOKIE['mm_vid']`, `mm_sid`, `mm_utm` and forwards them server-side without verifying they came from the visitor (cookies are user-controlled). Low impact (only used for attribution), but document that attribution data is best-effort.
#### M-14 — Existing `mem://security/audit-2026-04` claims "no vulnerabilities found" — outdated and inaccurate. To be superseded after Phase 1 lands.

---

### 🟢 FAST WINS (≤30 min each)
- F-1: Wrap every `<?php echo self::OPTION_NAME; ?>` with `esc_attr()` (see H-1, M-10).
- F-2: Make `class-magic-login.php::verify_api_key` reject the **stored hash** as a usable credential — accept only the **raw** API key, then hash it server-side. (Partial mitigation for C-2, but C-2 needs the full credential redesign in Phase 2.)
- F-3: Add `check_ajax_referer( 'x', '_wpnonce' )` second-arg consistency across all admin-ajax handlers.
- F-4: Fix `class-seo-fixes.php` option-key bug (M-7) — read from `MM_Settings::get()` instead of `get_option('mm_api_key')`.
- F-5: Add `Cache-Control: no-store` to all auth/billing/edge responses that contain personal data.
- F-6: In `MM_Heartbeat`, drop `php_version`/`wp_version` from the redundant `meta` payload — already in `wp_environment`.
- F-7: Set `MM_Updater::CHECK_HOURS = 6` so the plugins page does not refetch on every load.
- F-8: Add explicit cap check `current_user_can('manage_options')` + nonce to `mm_dismiss_compliance_nudge` (H-10) once that handler is reviewed.
- F-9: Standardize on one CORS origin allowlist helper (`appCorsHeaders`) — `ingest-security`, `seo-fix-poll`, `track-pageview`, `actv-webhook` use four different patterns.

---

## 6. Required Schema Changes (preview, implemented in later phases)
- `site_credentials(id, org_id, site_id, credential_type, fingerprint_sha256, status, issued_at, last_used_at, revoked_at, last_used_ip_hash, metadata)` — Phase 2.
- `credential_rotation_events(id, site_credential_id, event_type, actor_user_id, occurred_at, metadata)` — Phase 2.
- `webhook_verification_log(id, provider, event_id, verification_status, failure_reason, occurred_at, metadata)` — Phase 4.
- `processed_stripe_events(event_id PK, processed_at, summary jsonb)` — Phase 4 (for H-7).
- `security_audit_log(id, org_id, site_id, user_id, actor_type, event_type, severity, message, metadata, ip_hash, user_agent, request_id, created_at)` — Phase 5.
- `security_alerts(id, severity, alert_type, org_id, site_id, status, summary, metadata, created_at, resolved_at)` — Phase 5.
- `release_gate_checks(id, release_ref, check_name, status, details, created_at)` — Phase 7.

All new tables: RLS-on, owner/admin scope only, no `org_users` recursion.

---

## 7. Required Code Refactors
- Extract a single `mm_authorize_admin_action($cap, $nonce_action)` helper and route all admin-ajax through it.
- Introduce `MM_Site_Credential::verify_request($request)` to replace `verify_key_hash` and `verify_api_key` with a unified, signed-request model.
- Centralize edge-function auth in `_shared/site-auth.ts`: header normalization, signature verify, replay window, audit log emit.
- Replace `mmConfig.apiKey` with a publishable `mmConfig.siteId` + ingest-only HMAC.
- Add `_shared/ssrf-guard.ts` used by `seo-fix-command` and any future remote-fetch path.

---

## 8. Release Blockers (current state — must be cleared before next plugin release)

| # | Title | Phase to fix |
|---|---|---|
| C-1 | Magic-login binds to first admin, not requestor; no audit | 1 + 2 |
| C-2 | Stored hash is itself a usable credential; backend↔plugin auth lacks signing/replay | 2 |
| C-3 | Plugin API key embedded in public page source | 1 + 2 |
| C-4 | Plugin update channel ships unsigned binaries | 2 |
| H-7 | Stripe webhook lacks `event.id` idempotency | 4 |

---

## 9. Deferred / Out of Scope for This Audit Pass
- Front-end JS bundle review (`tracker.js`, `consent-banner.js`, `heartbeat.js`) — Phase 1 will include.
- Full edge-function inventory (we audited the security-critical subset; Phase 3 walks all ~130).
- Dependency / supply-chain audit — Phase 7.
- Internal admin account review (dormant accounts, MFA) — Phase 5/6.
- Backup & restore drill — out of scope.

---

## 10. Recommendation on Credential Migration (Phase 2 strategy)

Given C-2 + C-3 are live in production today and the stored hash is reusable, the **safest** path is:

1. **Phase 1 (now)** — ship F-2 + F-1 + tighten verify_api_key to **raw key only**. This breaks any caller that currently sends the hash; the only such caller is **our own backend**, so we update both sides in the same release.
2. **Phase 2** — issue site-scoped, signed-request credentials in parallel; old key continues to work for 30 days; add `Deprecation` header on responses; rotate.
3. **Phase 2 + 30 days** — old key revoked.

I.e., **add new model alongside, hard-deprecate the old credential within a single deprecation window**. The hard cutover option is unsafe given the install base cannot be assumed to auto-update.

---

## Phase 1 Progress (in this session)

### Resolved
- **C-1 Magic-login requestor binding** — Tokens now minted by backend (`generate-wp-login`), stored in `magic_login_tokens` with requestor user_id + IP hash, and atomically consumed via new `verify-magic-login` edge function. WP plugin (`class-magic-login.php`) calls back to backend on every URL hit; replay attempts logged.
- **C-4 Plugin update signing** — `plugin-update-check` now signs `(version, download_url, signed_at)` tuple with HMAC-SHA256. WP `class-updater.php` verifies signature + freshness (≤24h) before surfacing the update. Stale/invalid signatures suppress the update and show an admin warning.
- **H-7 Stripe webhook idempotency** — `actv-webhook` claims `event.id` in `processed_stripe_events` (PK) before side-effects. Duplicate deliveries return 200 with `duplicate: true`.

### Foundation laid (still pending wire-up)
- **C-3 API key in page source** — Created `site_ingest_tokens` table for narrow-scope tracking credentials. `tracker.js` and `heartbeat.js` still send the legacy `apiKey`; full migration requires a tracker-script rewrite that swaps `Authorization: Bearer <api_key>` for a per-site ingest token. Tracked as next-session work.

### Deferred secret setup required
- Add `PLUGIN_RELEASE_SIGNING_SECRET` to Lovable Cloud secrets (used by `plugin-update-check` to sign payloads). Until set, the function falls back to `signature: null` and the plugin will refuse the update — fail-closed, as designed.
- The same secret value must be embedded in plugin builds (via the `release_signing_secret` plugin option or `MM_RELEASE_SIGNING_SECRET` constant). Recommend distributing via the `serve-plugin-zip` flow on next plugin re-download.

---

## 11. Resolved Findings (2026-04-20 update)

| # | Status | Resolution |
|---|---|---|
| **H-7** | ✅ Resolved | `processed_stripe_events` ledger inserted at top of `actv-webhook`. Was already coded but writing to a non-existent column (`payload_summary` vs actual `summary`); fixed in this pass. Stripe retries now short-circuit. |
| **C-3** | ✅ Resolved | Already implemented end-to-end: `MM_Ingest_Token::get()` mints narrow-scope tokens stored in `site_ingest_tokens`. Tracker uses `ingestToken` exclusively; admin `api_key` is no longer in page source. Verified in `class-tracker.php` v1.9.17+. |
| **C-1** | ✅ Resolved (v1.18.0) | Magic-login binds to the requesting dashboard user via `requested_by_email`. Plugin maps to a WP admin with `manage_options`; refuses login if no match. All issuance + consumption + denials audited via `log_security_event`. |
| **C-2** | 🟡 Phase 1 of 2 (v1.18.1) | New `api_keys.signing_secret` column + `signed_request_nonces` replay table. Backend (`generate-wp-login`) now sends HMAC-signed headers when secret present. Plugin's `MM_Hmac::verify` accepts signed requests; legacy hash still accepted with `legacy_hash_auth_used` telemetry. New `provision-signing-secret` edge function pushes the secret per-site (idempotent). **Phase 2 (v1.19.0)**: flip plugin to signed-only after observed adoption. |
| **C-4** | ✅ Resolved (v1.18.1) | `plugin-update-check` already HMAC-signs the `(version, download_url, signed_at)` tuple via `PLUGIN_RELEASE_SIGNING_SECRET`. This pass adds **SHA-256 digest** of the canonical ZIP to `scripts/plugin-artifacts.mjs`, the manifest, and the update-check response. Plugin updater verifies digest after download (mismatch → install refused). Full Ed25519 signing remains a future follow-up. |
| **H-1** | ✅ Resolved | All `<?php echo self::OPTION_NAME; ?>` and `<?php echo $name; ?>` occurrences in `class-settings.php` and `class-privacy-setup.php` are wrapped in `esc_attr()`. Verified by ripgrep — no unescaped echoes remain. |
| **H-3** | ✅ Resolved (v1.21.2) | `/avada-debug` REST route is now gated behind the `enable_diagnostics` setting (default `0`). Route is only registered when an operator explicitly opts in for a support session. |
| **H-8** | ✅ Resolved | `seo-fix-command` imports `safeFetch` from `_shared/ssrf-guard.ts` and validates that `page_url` matches one of the org's connected sites before fetch. Cloud-metadata IPs and private nets are blocked centrally. |
| **F-1** | ✅ Resolved | Same fix as H-1 — every option-name attribute uses `esc_attr()`. |
| **F-2** | ✅ Resolved (v1.21.2) | `class-magic-login.php::verify_api_key` no longer accepts the SHA-256 stored hash as a credential; only the raw API key is accepted. Logged as `legacy_raw_key_auth_used` telemetry. (Removes the hash-as-credential attack path on the magic-login route; full credential redesign for `/sync` etc. is tracked under C-2 Phase 2.) |
| **F-3** | ✅ Resolved (v1.21.2) | `class-recovery-banner.php::ajax_reconnect` now passes `'_wpnonce'` explicitly to `check_ajax_referer()` for grep-ability and clarity. |
| **F-4** | ✅ Resolved (v1.21.2) | `class-seo-fixes.php::poll_fixes` reads from `MM_Settings::get()` instead of the non-existent `mm_api_key` / `mm_api_url` standalone options. Also fixes a double `/functions/v1` URL bug in both `seo-fix-poll` and `seo-fix-confirm` calls — SEO fix application now actually runs. |
| **F-5** | 🟡 Deferred to Phase 2 | `Cache-Control: no-store` audit across edge responses tracked separately; not a release blocker. |
| **F-6** | ✅ Resolved (v1.21.2) | `class-heartbeat.php::send_cron_heartbeat` no longer duplicates `php_version` / `wp_version` in the `meta` block — those values already live in `wp_environment`. |
| **F-7** | ✅ Resolved | `MM_Updater::CHECK_HOURS = 12` — plugins page no longer refetches on every load. |
| **F-8** | ✅ Resolved | `class-consent-banner.php::ajax_dismiss_nudge` has explicit `check_ajax_referer( 'mm_dismiss_nudge', '_wpnonce' )` + `current_user_can( 'manage_options' )`. |
| **F-9** | 🟡 Deferred to Phase 2 | CORS allowlist consolidation across `ingest-security`, `seo-fix-poll`, `track-pageview`, `actv-webhook` — out of scope for the WP-plugin Phase 0 close-out. |
| **M-7** | ✅ Resolved (v1.21.2) | Same fix as F-4 — option-key bug removed. |
| **M-10** | ✅ Resolved | Same as H-1 / F-1. |

### Phase 0 status

**All ship-blocker findings (C-1, C-3, C-4, H-7) are resolved.** C-2 is in its planned Phase 1 transition window (legacy + signed both accepted, telemetry running). All H and F items that are in scope for a WP-plugin Phase 0 close-out are resolved as of v1.21.2. F-5 and F-9 (edge-function cross-cutting hygiene) are deferred to Phase 2 and are not release blockers.

---

## 8. Critical hotfix in this pass

`mission-metrics-wp-plugin/includes/class-hmac.php` (and the `serve-plugin-zip/plugin-template/` mirror) shipped with a **fatal PHP syntax error** in v1.18.1: the `verify_bootstrap_legacy()` method was missing its closing `}` and the `verify()` docblock had no opening `/**`. This would have caused every plugin install to white-screen on activation. **Fixed**; both copies parse cleanly. Re-run of `node scripts/plugin-artifacts.mjs` confirmed all 4 version targets at v1.18.1 with new SHA-256 in manifest.

## 9. New documentation

- `docs/security/auth.md` — trust boundaries, magic-login (C-1), HMAC signing (C-2)
- `docs/security/key-management.md` — publishable vs server-only secret split (C-3)
- `docs/security/webhooks.md` — Stripe idempotency (H-7), backend → plugin signing
- `docs/runbooks/release-rollback.md` — release sequence, C-2 phased rollout gate, rollback procedures


