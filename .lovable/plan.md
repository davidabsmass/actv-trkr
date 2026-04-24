## Goal

When a user wants to connect a second (or third, etc.) WordPress site, they should reuse the **same org-level API key** — no new key generated, no existing sites disconnected. Today the "Add Site" modal dumps them into the first-time setup page, which encourages them to regenerate the key (breaking existing connections) and is confusing.

## Background (confirmed in code)

- `api_keys` is org-scoped — one active key per organization. All sites under the org authenticate with the same key.
- `ingest-heartbeat` already auto-registers a new `sites` row when a previously-unseen `site_url` sends its first heartbeat with a valid key. No manual site creation needed.
- Raw keys are only shown once at generation time (hashed in DB). We will **not** change that — no "re-show the key" behavior.

## What changes

### 1. New dedicated Add Site flow page: `/settings?tab=add-site`

A new screen purpose-built for adding a second+ site to an existing account. It never offers to generate a key.

Structure (3 steps):

1. **Use your existing license key**
   - Explains the key is already active and works across all sites.
   - Shows the plugin download button (same ZIP, latest version).
   - Shows a "Can't find your key?" disclosure that explains: because keys are stored hashed for security, we can't re-display it. Options: (a) look it up where you saved it, or (b) regenerate — **with a clear warning that this disconnects all currently-connected sites** and requires re-pasting the new key on each.

2. **Install the plugin on the new WordPress site**
   - Short inline instructions (Plugins → Add New → Upload → Activate).

3. **Paste your existing key into WordPress → Settings → ACTV TRKR → Save**
   - Polling indicator: watches for a new `sites` row to appear under this org. When it does, shows success and links to Dashboard.

### 2. `AddSiteModal` routes here instead of `/settings?tab=setup`

- Change `navigate("/settings?tab=setup")` → `navigate("/settings?tab=add-site")`.
- Tighten the modal copy so it says explicitly: "You'll use your existing license key — no new key needed."

### 3. Settings tab plumbing

Add `add-site` as a recognized tab value in `Settings.tsx` so the new flow renders when `?tab=add-site` is in the URL. The existing `setup` tab (first-time setup / WebsiteSetup.tsx) stays exactly as-is for brand-new organizations.

### 4. Retain existing backend behavior — nothing changes

- `replace_org_api_key` RPC: untouched.
- `ingest-heartbeat` auto-registration of new sites: untouched.
- Existing sites: unaffected. The only way to rotate the key remains the explicit "Replace key" button in `ApiKeysSection`, which already warns appropriately.

## Files to edit / create

| File | Change |
|------|--------|
| `src/pages/AddSite.tsx` | **New.** The 3-step flow described above. |
| `src/pages/Settings.tsx` | Register `add-site` tab → render `<AddSite />`. |
| `src/components/sites/AddSiteModal.tsx` | Route to `?tab=add-site`; tighten copy. |
| `src/locales/en/common.json` | Add strings for the new flow. |

## Out of scope (deliberately)

- Changing how the key is stored (staying hashed).
- Any billing/Stripe changes for the $35/mo additional-site charge — modal already clarifies billing is handled separately.
- Changing `WebsiteSetup.tsx` (first-time setup) or the `Replace key` UX in `ApiKeysSection`.

## Technical notes

- Plugin download in the new flow uses `downloadPlugin()` from `@/lib/plugin-download` — same helper used elsewhere. It requires the key to embed in the ZIP. Since we don't have the raw key on this page, the download button will fetch the unkeyed plugin ZIP (plain install — user pastes their existing key manually in WP admin). Confirm `downloadPlugin()` supports a no-key path, or use a plain `<a href>` to the public plugin ZIP endpoint (`serve-plugin-zip` without a key param). I'll verify during implementation.
- "Watch for new site" polling: reuse the existing `useSites(orgId)` hook with a short `refetchInterval` while on the final step. When `sites.length` increases, show success.
