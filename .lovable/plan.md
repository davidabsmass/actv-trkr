

## Fix: App showing plugin v1.8.7 instead of v1.8.8

### Problem
The codebase already has v1.8.8 in all source files, but the deployed edge functions are still serving the old version. The app reads the version from the `serve-plugin-zip` edge function's `x-plugin-version` response header via a HEAD request.

### Root Cause
The `serve-plugin-zip` and `plugin-update-check` edge functions were not redeployed after the last code changes. Additionally, the `plugin-update-check` changelog is outdated (tops out at v1.6.2, missing all entries from 1.7.0 through 1.8.8).

### Plan

**Step 1: Update `plugin-update-check` changelog**
Add changelog entries for versions 1.7.0 through 1.8.8 to `supabase/functions/plugin-update-check/index.ts` so the WordPress update checker also reports the correct version.

**Step 2: Deploy edge functions**
Redeploy both `serve-plugin-zip` and `plugin-update-check` edge functions so the live endpoints serve v1.8.8.

**Step 3: Verify**
Confirm the `serve-plugin-zip` HEAD request returns `x-plugin-version: 1.8.8` and the app displays the correct version on the Get Started page.

