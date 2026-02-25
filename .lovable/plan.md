

# WordPress Plugin for ACTV TRKR

The plugin hasn't been built yet. Here's the plan to create a complete, installable WordPress plugin.

## What gets built

A folder `mission-metrics-wp-plugin/` at the project root containing a ready-to-zip WordPress plugin with these files:

### File structure
```text
mission-metrics-wp-plugin/
├── mission-metrics.php          ← Plugin bootstrap
├── includes/
│   ├── class-settings.php       ← Admin settings page (API key, endpoint URL, toggles)
│   ├── class-tracker.php        ← Enqueues tracker.js sitewide
│   ├── class-gravity.php        ← gform_after_submission hook
│   └── class-retry-queue.php    ← WP-Cron retry for failed API calls
├── assets/
│   └── tracker.js               ← First-party pageview tracking script
└── readme.txt                   ← Standard WP plugin readme
```

### tracker.js behavior
- On every page load:
  - Sets `mm_vid` cookie (visitor ID, 365 days)
  - Sets/refreshes `mm_sid` cookie (session ID, 30-minute rolling window)
  - Captures UTMs from URL into `mm_utm` cookie (30 days)
  - Sends `POST` to the `track-pageview` backend function with the full payload (source, event, attribution, visitor)
  - Generates a unique `event_id` per pageview for idempotency

### Gravity Forms integration
- Hooks into `gform_after_submission`
- Reads `mm_vid`, `mm_sid`, `mm_utm` cookies from the PHP request
- Sends the form entry + context (UTMs, referrer, visitor_id, session_id) to the `ingest-gravity` backend function
- On failure, queues the payload in a custom WP table (`mm_retry_queue`) and retries via WP-Cron every 5 minutes

### Settings page
- **API Key** field (stored encrypted in `wp_options`)
- **Endpoint URL** (defaults to: `https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1`)
- **Enable Tracking** toggle
- **Enable Gravity Forms** toggle
- **Test Connection** button that validates the API key against the backend

### How you'll use it
1. Download the plugin folder as a `.zip`
2. In WordPress: Plugins → Add New → Upload Plugin → select the zip
3. Activate, go to Settings → Mission Metrics
4. Paste your API key (from the ACTV TRKR onboarding screen)
5. Enable tracking — pageviews start flowing immediately
6. Submit a test Gravity Form — it appears in your Entries

## Technical details

- The endpoint base URL will be: `https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1`
  - Pageview endpoint: `/track-pageview`
  - Gravity endpoint: `/ingest-gravity`
- Auth: `Authorization: Bearer <api_key>` header on every request
- tracker.js uses `navigator.sendBeacon()` with `fetch()` fallback for reliability
- Session logic: new session if no `mm_sid` exists OR last activity > 30 min OR UTM params changed
- Plugin version is sent in every payload so the backend can track it
- All API calls are non-blocking (async JS / wp_remote_post with timeout)

