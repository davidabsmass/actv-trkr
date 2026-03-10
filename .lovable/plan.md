

# Security Fixes Plan

Four issues to address from the security scan, in priority order.

---

## 1. Protect background job endpoints with a shared secret

**Problem:** Functions like `aggregate-daily`, `archive-nightly`, `retention-cleanup`, `weekly-summary`, and `process-report` can be called by anyone, enabling DoS and AI credit abuse.

**Fix:**
- You generate a random string (e.g. `openssl rand -hex 32`) and store it as a `CRON_SECRET` in your backend secrets.
- Add a guard to the top of each of those 5 functions:
  ```typescript
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  ```
- Update any cron job definitions (pg_cron) to pass the secret in the request headers.

---

## 2. Remove the `key_plain` column from `api_keys`

**Problem:** The column still exists even though it was cleared by a previous migration. It could be repopulated.

**Fix:**
- Database migration: `ALTER TABLE public.api_keys DROP COLUMN IF EXISTS key_plain;`
- Update `trigger-site-sync` to use an alternative approach: store the WP API key as a per-site secret in a new `site_secrets` column or use Vault. For simplicity, add an encrypted `wp_api_key` column on the `sites` table that is only readable server-side (service role), or refactor the sync flow so the user pastes their key into the WordPress plugin settings and the plugin sends it to the edge function (eliminating server-side plaintext storage).
- Update `ApiKeysSection.tsx` to show the key only once at creation time and never retrieve `key_plain`.

---

## 3. Enable leaked password protection

**Fix:** Use the auth configuration tool to enable the HIBP password check so users cannot sign up with known-compromised passwords.

---

## 4. Update vulnerable dependency

**Problem:** `react-simple-maps` has a high-severity vulnerability.

**Fix:** Replace it with a safe alternative or update to a patched version. The component is used in `VisitorMapSection.tsx` — if no safe version exists, replace the map with a simple table/list of countries or use a different mapping library.

---

### Implementation order
1. Store `CRON_SECRET` → guard all 5 background functions
2. Drop `key_plain` column and refactor `trigger-site-sync`
3. Enable leaked password protection
4. Address `react-simple-maps` vulnerability

