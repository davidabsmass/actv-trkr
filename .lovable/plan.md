

## Plan: Reduce Costs — Heartbeat Interval + Plugin Update Caching

### Changes

**1. Increase heartbeat interval from 10s → 30s** (`mission-metrics-wp-plugin/assets/tracker.js`)
- Change `HEARTBEAT_INTERVAL` from `10000` to `30000`
- This cuts time-update edge function calls by ~66%

**2. Add `Cache-Control` headers to `plugin-update-check`** (`supabase/functions/plugin-update-check/index.ts`)
- Add `Cache-Control: public, max-age=3600` (1 hour) to both `check` and `info` responses
- The WordPress updater already uses a 12-hour transient (`CHECK_HOURS = 12`), but the cache header ensures CDN/browser-level caching too, reducing redundant function invocations

**3. Bump plugin version to 1.3.1** (`supabase/functions/plugin-update-check/index.ts`)
- Update `LATEST_VERSION` to `"1.3.1"` and add a changelog entry noting the heartbeat optimization
- This ensures existing installs pick up the new tracker.js via the auto-update mechanism

