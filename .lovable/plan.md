

## Issues Found

### 1. Duplicate Notifications Tab
Line 283-284 in `src/pages/Monitoring.tsx` has the Notifications tab trigger duplicated:
```tsx
<TabsTrigger value="notifications">Notifications</TabsTrigger>
<TabsTrigger value="notifications">Notifications</TabsTrigger>
```
**Fix**: Remove line 284 (the duplicate).

### 2. Forms Sync Failed
The "Re-check Now" button in the Form Checks tab calls `trigger-site-sync`, which makes a request to the WordPress site's REST API (`/wp-json/actv-trkr/v1/sync`). If the WP site blocks the request, is behind authentication, or the REST endpoint isn't registered, the sync will fail with a 502 or 500 error.

The edge function sends a `key_hash` in the body, but the WordPress `rest_verify_api_key` method likely expects the raw API key (not the hash) for verification. This mismatch would cause authentication failure on the WP side.

**Fix**: The `trigger-site-sync` function cannot send the raw API key (it only has the hash). The WP plugin's REST endpoint needs to accept verification via `key_hash` directly. Update `class-settings.php`'s `rest_verify_api_key` to also check by hash comparison, or update the edge function to pass a service-level token instead.

However, since the WP plugin code is bundled in this repo but runs externally, the more practical fix is to update the error handling in the UI to show a more helpful error message, and verify the WP plugin's `rest_sync` handler accepts the `key_hash` parameter.

### Changes

| File | Change |
|------|--------|
| `src/pages/Monitoring.tsx` (line 284) | Remove duplicate Notifications TabsTrigger |
| `mission-metrics-wp-plugin/includes/class-settings.php` | Update `rest_verify_api_key` to support `key_hash` authentication from the dashboard |

