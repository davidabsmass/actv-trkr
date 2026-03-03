

## Add Heartbeat to the Downloaded Plugin

### Problem
The `serve-plugin-zip` edge function builds the plugin zip that users download, but it does not include:
1. `includes/class-heartbeat.php` — the PHP class that enqueues the JS beacon and runs a WP-Cron fallback
2. `assets/heartbeat.js` — the JS beacon script
3. The main plugin file doesn't `require_once` or `init()` the heartbeat class
4. The settings class doesn't include `enable_heartbeat` in its defaults or render a checkbox for it

Without these, the plugin never sends heartbeats and the site always shows as DOWN.

### Changes

**`supabase/functions/serve-plugin-zip/index.ts`**

1. **Add `class-heartbeat.php`** to the `buildFiles()` output — a PHP class that:
   - Checks `enable_heartbeat` setting is enabled (default: on)
   - Enqueues `heartbeat.js` on the front-end with the correct endpoint (`/ingest-heartbeat`)
   - Schedules a WP-Cron fallback every 5 minutes that POSTs to the same endpoint

2. **Add `heartbeat.js`** to the `buildFiles()` output — a small JS beacon that fires once per page load after a 2-second debounce

3. **Update the main plugin PHP** (`actv-trkr.php` string) to:
   - `require_once` the heartbeat class
   - Call `AT_Heartbeat::init()` during boot
   - Schedule the heartbeat cron on activation

4. **Update `class-settings.php`** string to:
   - Add `enable_heartbeat => '1'` to defaults
   - Add a checkbox row for "Enable Heartbeat" in the settings form
   - Include `enable_heartbeat` in the sanitize function

### No other changes needed
- The `ingest-heartbeat` edge function already exists and works (confirmed via curl — it correctly validates API keys)
- The `check-uptime` function already monitors heartbeats and marks sites DOWN
- The `site_heartbeats` table and `sites.last_heartbeat_at` column already exist

