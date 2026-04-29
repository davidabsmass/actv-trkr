## Problem

The "Add another site" flow (`/settings?tab=add-site`) currently asks the user to:
1. Find their old license key in a password manager
2. Download a generic plugin ZIP
3. Paste the key into WordPress manually

That's the friction you remembered avoiding. The infrastructure to skip it **already exists** — it just isn't wired up on this page.

## What's already built (and why this is small)

- `serve-plugin-zip` edge function accepts an `x-actvtrkr-api-key` header and injects that key directly into the plugin ZIP's `mm_api_key` option, so the plugin activates pre-configured.
- `downloadPlugin(apiKey)` in `src/lib/plugin-download.ts` already takes an optional `apiKey` arg and routes through that endpoint when present.
- The org's hashed key already lives in `api_keys`. We can't recover the **raw** key (by design — it's hashed for security), so we generate a **new** key and use that for the new site's ZIP.

The catch: a new key, by itself, would normally require revoking the old one (one-active-key policy). But for this flow we want **multiple sites to keep working**. So we need to relax that policy slightly — or, better, rotate everyone to the new key transparently.

## Recommended approach: one-click pre-keyed download

Replace the current 3-step "find your key + download + paste" flow with a single primary action: **"Download pre-configured plugin"**.

Behind the scenes:
1. Generate a fresh raw key, hash it, insert into `api_keys` (alongside the existing key — do **not** revoke the old one).
2. Allow that raw key (held only in memory) to be passed to `downloadPlugin(rawKey)`.
3. The downloaded ZIP arrives with the key already embedded — user just installs and activates. No paste, no copy, no password manager hunt.
4. Keep the existing site-detection polling + success card.

### Why allow two active keys here

Today `generateKey()` in `WebsiteSetup.tsx` revokes all prior keys. That's correct for first-time setup. For "add another site" we explicitly want to **add** a key, not rotate. Both keys hash-match against `api_keys` rows; `plugin-auth.ts` already accepts any non-revoked match. No backend changes required — just don't call the revoke loop on this path.

This is the minimum-risk option. Existing sites keep working on the old key; the new site uses the new key; both ingest into the same org. If the user later wants to consolidate, they can rotate from API Keys.

### Fallback: "I already have my key"

Keep a small secondary link — `Already have your license key? Paste it instead` — that expands the current manual-paste flow. Covers the rare power-user case and anyone who genuinely wants to reuse the existing key across sites.

## Files to change

- **`src/pages/AddSite.tsx`** — rewrite the 3-step flow:
  - Step 1 (NEW): "Download pre-configured plugin" — single button that generates a key (without revoking) and immediately calls `downloadPlugin(rawKey)`.
  - Step 2: "Install & activate in WordPress" (just install instructions, no key paste).
  - Step 3: success card on detection (unchanged).
  - Collapsible: "Already have your license key? Use it instead" → reveals current paste-based flow.
- **`src/components/sites/AddSiteModal.tsx`** — update body copy: remove "you'll use your existing license key — no new key needed" (no longer accurate when using the auto-keyed ZIP). Replace with "We'll prepare a plugin file with your account already linked — just install and activate."

## Out of scope

- No edge-function changes (`serve-plugin-zip` already supports this).
- No DB schema changes.
- No change to first-time `WebsiteSetup.tsx` — that stays as-is.
- Billing for additional sites stays deferred (per the existing TODO).

## Risk

Low. The endpoint and download library already do this; we're wiring up an existing capability on a new page and adding one extra `api_keys` row per add-site action.
