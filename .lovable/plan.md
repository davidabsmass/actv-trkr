

## Fix: Click Activity not populating for Georgia Bone and Joint

### Root Cause

The tracker sends **pageviews** via `send()` (which uses `fetch` with `keepalive` and proper headers), but sends **click events** via `sendBeaconSafe()` (which uses `navigator.sendBeacon`).

`sendBeacon` has a critical limitation: it cannot set custom headers like `Authorization`. While the API key is included in the request body as a fallback, `sendBeacon` with a `Blob({ type: 'application/json' })` can trigger CORS preflight requests. If the site's hosting environment, CDN, or firewall silently blocks or doesn't properly handle the preflight OPTIONS request to the edge function URL, the event POST never reaches the server — and fails silently (the tracker wraps everything in `try/catch` with empty error handlers).

This explains why Apyx (30 events) works but Georgia Bone and Joint (0 events) doesn't — different hosting environments handle CORS preflight differently.

### Fix

**File: `mission-metrics-wp-plugin/assets/tracker.js`**

Change `flushEventBatch()` to use `send()` (fetch with keepalive + Authorization header) instead of `sendBeaconSafe()`. This matches how pageviews are sent and ensures proper CORS handling with headers.

```text
Current (line 368):
  sendBeaconSafe(eventEndpoint, payload)

Change to:
  send(eventEndpoint, payload)
```

This one-line change makes event delivery use the same reliable transport as pageview delivery. The `send()` function already has a fallback to `sendBeacon` if `fetch` fails, so there's no loss of reliability.

**Bump plugin version** in `mission-metrics.php` from `1.4.1` to `1.4.2` so the auto-updater pushes the fix to all sites.

### Files to change
1. `mission-metrics-wp-plugin/assets/tracker.js` — switch `flushEventBatch` from `sendBeaconSafe` to `send`
2. `mission-metrics-wp-plugin/mission-metrics.php` — bump `MM_PLUGIN_VERSION` to `1.4.2`
3. `mission-metrics-wp-plugin/readme.txt` — update changelog

