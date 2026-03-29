

## Fix: Hide misleading "No API key" warning for active accounts

### Problem
The Website Setup page shows a scary "No API key generated yet" warning even for accounts like APYX Medical that have active sites connected and tracking data flowing. This happens because the raw API key is only shown once at generation time, and the `key_hash` record may not be visible (due to admin-only RLS) or may have been revoked and regenerated. The warning is misleading for active accounts.

### Solution
Instead of showing a warning when no API key record is found, check whether the account has active connected sites. If sites are connected and sending heartbeats, the key is clearly working — show a "Key active" confirmation instead of the warning.

### Changes

**1. `src/pages/WebsiteSetup.tsx`** (lines 345-355)
- Replace the current binary logic (`apiKeyData ? show key : show warning`) with a three-state check:
  - If `apiKeyData` exists: show the key hash display (current behavior)
  - If no `apiKeyData` but sites are connected with heartbeats: show a green "License key is active and connected" confirmation with a note that the full key is only shown once
  - If no `apiKeyData` AND no connected sites: show the current warning directing them to generate a key

**2. `src/locales/en/common.json`** (and other locale files)
- Add new translation keys:
  - `websiteSetup.keyActiveConnected`: "Your license key is active and your site is connected."
  - `websiteSetup.keyActiveConnectedDesc`: "The full API key is only shown once when generated. Your plugin is already configured and tracking data."

### Technical detail
The `websiteConnected` boolean (derived from `connectedSites.length > 0`) already exists on line 91 and will be reused for this check. No new queries needed.

