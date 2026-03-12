

## Problem Identified

Two issues are preventing the update from showing:

1. **`plugin-update-check` edge function is not deployed** -- calling it returns a 404. The code and config exist but it was never deployed. WordPress sites can't check for updates because the endpoint doesn't exist.

2. **`serve-plugin-zip` still builds version 1.2.0** -- line 10 has `PLUGIN_VERSION = "1.2.0"` and its `buildFiles()` function generates the old tracker.js without the `active_seconds`/pageTimer code. Even if WordPress could see the update, the downloaded ZIP would still be 1.2.0.

## Plan

### 1. Deploy `plugin-update-check`
The function code exists and looks correct (already shows `LATEST_VERSION = "1.3.0"`). It just needs to be deployed. This will happen automatically when we make any edit, or we can trigger a deploy.

### 2. Update `serve-plugin-zip/index.ts` to version 1.3.0
- Bump `PLUGIN_VERSION` from `"1.2.0"` to `"1.3.0"` (line 10)
- Update the `buildFiles()` function to include the 1.3.0 tracker.js code with:
  - `pageTimer` / active time-on-page tracking (focus-aware heartbeats sending `time_update` events)
  - Intent-based click tracking (CTA clicks, download clicks, outbound links)
  - The `active_seconds` field in track-pageview calls
- Add `class-broken-links.php` to the generated ZIP (missing from current buildFiles)
- Add `form_probe_cron` scheduling in the main plugin file
- Update the main plugin PHP to require and boot `AT_Broken_Links`

This ensures that when WordPress downloads the 1.3.0 update, it actually gets the new code with engagement tracking.

### Technical Details
- The `serve-plugin-zip` edge function dynamically generates plugin files in memory via `buildFiles()`. The tracker.js string literal needs to be expanded with the pageTimer logic from `mission-metrics-wp-plugin/assets/tracker.js`.
- Both edge functions will auto-deploy on save.
- After deployment, WordPress sites need to clear the `at_update_data` transient (or wait up to 12 hours) or click Dashboard > Updates > Check Again.

