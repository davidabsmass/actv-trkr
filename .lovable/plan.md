

## Plan: Enable In-Place Plugin Updates (No Re-Download)

### The Insight
WordPress stores plugin settings (`mm_options`) in the database, which **survives plugin file updates**. The baked-in API key only seeds the settings on first activation. So we can serve a generic (key-free) ZIP for updates and the existing saved credentials persist.

### What Changes

**1. New backend function: `serve-plugin-zip`**
A new backend function that dynamically generates the latest plugin ZIP on-the-fly (without any baked-in API key). This serves as the `package` URL that WordPress downloads during auto-update.
- Builds the same ZIP structure as `plugin-download.ts` but with empty `MM_BAKED_API_KEY` / `MM_BAKED_ENDPOINT` constants
- The settings class already falls back to saved `wp_options` when baked values are empty, so everything keeps working

**2. Update `plugin-update-check` endpoint**
- Set `download_url` to point to the new `serve-plugin-zip` function instead of `null`
- Remove `requires_redownload: true`
- Set `package` in the update response so WordPress can auto-download

**3. Update `class-updater.php` in the download template**
- Set `'package'` to the `download_url` from the backend response (instead of empty string)
- WordPress will then show the standard "Update Now" button that works automatically

**4. Update `plugin-download.ts`**
- Include the updated `class-updater.php` template in future downloads
- Adjust the activation logic: only seed settings from baked values if no settings exist yet (already does this with the `empty($opts['api_key'])` check)

### Technical Detail

```text
Current flow:
  WP checks for update → backend says "new version, re-download from dashboard" → manual

New flow:
  WP checks for update → backend says "new version, here's the ZIP URL" → one-click update
  ZIP has no API key → WP replaces files → saved wp_options still has the key → works
```

The `serve-plugin-zip` function will require the site's domain as a query parameter for logging, but no authentication since WordPress's updater makes unauthenticated requests.

