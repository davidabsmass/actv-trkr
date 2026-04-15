

# Full Application Audit — Critical and High-Priority Findings

## CRITICAL ISSUES

### 1. Stripe Webhook Accepts Unsigned Events
**File:** `supabase/functions/actv-webhook/index.ts` (lines 28-34)
**Issue:** When `STRIPE_WEBHOOK_SECRET` is not set, the webhook silently falls back to parsing raw JSON body without any signature verification. An attacker can forge any Stripe event (fake subscriptions, fake payments, fake cancellations) by POSTing crafted JSON to this endpoint.
**Why it matters:** Complete billing bypass — anyone can create fake subscriptions, churn users, or trigger welcome emails to arbitrary addresses.
**Fix:** Fail hard if `STRIPE_WEBHOOK_SECRET` is not configured. Remove the `JSON.parse(body)` fallback entirely. Return 500 if the secret is missing.

### 2. Magic Login Sends `key_hash` as API Key to WordPress
**File:** `supabase/functions/generate-wp-login/index.ts` (lines 96-98)
**Issue:** The code reads `key_hash` from the `api_keys` table and sends it as the `X-Api-Key` header to WordPress. But `key_hash` is the SHA-256 hash of the actual API key, not the raw key. The WordPress side (`class-magic-login.php` line 41) compares it with `hash_equals($api_key, $auth)` against the stored raw key. This will **never match** — magic login is completely broken.
**Why it matters:** The "Login to WordPress" feature from the dashboard silently fails for every user.
**Fix:** The edge function cannot recover the raw key from the hash. The WP plugin needs to also store/compare the hash, or a separate shared secret must be established for this endpoint.

### 3. In-Memory Rate Limiter Resets on Every Cold Start
**File:** `supabase/functions/_shared/rate-limiter.ts` (entire file)
**Issue:** The rate limiter uses an in-memory `Map`. Edge functions scale horizontally across multiple isolates and cold-start frequently (visible in logs — constant boot/shutdown cycles). Each new isolate gets a fresh empty map. A determined attacker rotating across isolates effectively has no rate limit.
**Why it matters:** All rate limiting (AI spam, feedback spam, export abuse) provides minimal real protection. The same issue affects `ingestion-security.ts`.
**Fix:** For authenticated endpoints, use a database-backed counter (e.g. a `rate_limits` table or Redis). For ingestion endpoints, the in-memory approach is acceptable as a first line of defense but should not be the only layer.

---

## HIGH-PRIORITY ISSUES

### 4. Email Assets Bucket Publicly Readable (Security Scan Finding)
**File:** Storage RLS policy `email_assets_select_by_path`
**Issue:** The `email-assets` private bucket has a SELECT policy granting access to the `public` (unauthenticated) role. Anyone can enumerate and download all email template assets.
**Why it matters:** Potential data exposure; assets could contain branding or internal content.
**Fix:** Restrict the SELECT policy to `authenticated` role, or mark the bucket as public if the assets are truly non-sensitive.

### 5. Geo-IP Lookup Uses Unencrypted HTTP
**File:** `supabase/functions/track-pageview/index.ts` (line 108)
**Issue:** `http://ip-api.com/json/...` — the geo-lookup sends raw visitor IP addresses over plain HTTP. Any network intermediary can intercept these IPs.
**Why it matters:** PII (IP addresses) transmitted in cleartext violates the privacy-first principles of the platform.
**Fix:** Use the HTTPS endpoint (`https://pro.ip-api.com` requires a paid key) or switch to a provider with free HTTPS (e.g. `ipinfo.io`).

### 6. `listUsers()` Without Pagination in Webhook
**File:** `supabase/functions/actv-webhook/index.ts` (line 91)
**Issue:** `await supabase.auth.admin.listUsers()` fetches ALL users when looking up an existing user by email. As the user base grows, this becomes extremely slow and may time out or exceed memory limits.
**Why it matters:** Checkout flow breaks at scale — new subscribers won't get properly provisioned.
**Fix:** Use `supabase.auth.admin.listUsers({ filter: email })` or the `getUserByEmail` admin method if available, or query the `profiles` table instead.

### 7. Checkout Origin Fallback is Hardcoded to Preview Domain
**Files:** `supabase/functions/create-checkout/index.ts` (line 45), `customer-portal/index.ts` (line 36)
**Issue:** `const origin = req.headers.get("origin") || "https://mshnctrl.lovable.app"` — if the Origin header is absent (some browsers strip it), the Stripe success/cancel URLs redirect to the Lovable preview domain instead of `actvtrkr.com`.
**Why it matters:** Users completing checkout may land on the wrong domain and lose their session.
**Fix:** Change the fallback to `"https://actvtrkr.com"`.

### 8. Invite Code Race Condition
**File:** `supabase/functions/redeem-invite/index.ts` (lines 125-128)
**Issue:** `use_count` is incremented with `invite.use_count + 1` read-then-write pattern. Two concurrent redemptions can both read the same count and both succeed, exceeding `max_uses`.
**Why it matters:** Invite codes can be over-redeemed beyond their intended limits.
**Fix:** Use an atomic SQL increment: `.rpc('increment_invite_use', { invite_id })` or use a Postgres function with `UPDATE ... SET use_count = use_count + 1 WHERE use_count < max_uses RETURNING *`.

### 9. Admin Role Check Uses `anonClient` (Potential RLS Bypass)
**File:** `supabase/functions/admin-manage-user/index.ts` (lines 37-42)
**Issue:** The admin role check queries `user_roles` via the `anonClient` (authenticated as the caller). If the RLS policy on `user_roles` allows users to only see their own roles, this works correctly. But if there's no RLS on `user_roles` or an overly permissive policy, a non-admin could potentially manipulate the query. The check itself is sound, but should use the service role client to ensure consistent results regardless of RLS configuration.
**Why it matters:** Defense-in-depth — admin verification should not depend on RLS policy correctness.
**Fix:** Use the `adminClient` (service role) for the role check query.

### 10. Realtime Channel Subscriptions Not Scoped by Org
**Issue (from security scan):** `site_tracking_status` is published to Realtime, but there are no RLS policies on `realtime.messages`. Any authenticated user can subscribe to any channel and receive tracking status updates for all organizations.
**Why it matters:** Cross-tenant data leakage — users can observe competitor site activity status.
**Fix:** Add RLS policies on the realtime subscription or filter channels by `org_id` in the client code.

---

## Summary Table

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | CRITICAL | Billing | Stripe webhook accepts unsigned events |
| 2 | CRITICAL | Auth | Magic login is broken (hash vs raw key mismatch) |
| 3 | HIGH | Security | Rate limiter ineffective (in-memory, multi-isolate) |
| 4 | HIGH | Storage | Email assets bucket publicly readable |
| 5 | HIGH | Privacy | Geo-IP lookup over plain HTTP |
| 6 | HIGH | Scale | `listUsers()` without pagination in webhook |
| 7 | HIGH | UX | Checkout origin fallback to wrong domain |
| 8 | HIGH | Logic | Invite code race condition |
| 9 | HIGH | Auth | Admin role check via anonClient |
| 10 | HIGH | Privacy | Realtime channels not scoped by org |

---

## Recommended Implementation Order

1. Fix #1 (Stripe webhook) — immediate, highest risk
2. Fix #2 (Magic login) — currently broken feature
3. Fix #7 (Checkout origin) — quick win, one-line change
4. Fix #6 (listUsers pagination) — scales poorly
5. Fix #4 (Storage policy) — update RLS
6. Fix #5 (HTTPS geo-IP) — privacy compliance
7. Fix #8 (Invite race condition) — add atomic increment
8. Fix #9 (Admin role check) — defense in depth
9. Fix #10 (Realtime scoping) — add channel policies
10. Fix #3 (Rate limiter) — requires architectural change to DB-backed approach

Shall I proceed with implementing these fixes?

