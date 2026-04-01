
## Fix plugin ZIP version mismatch

### What’s actually wrong
I checked the code and confirmed the mismatch is real:

- `plugin-update-check` already advertises `1.5.9`
- but WordPress plugin headers still say `Version: 1.5.7` in the main plugin file
- and `serve-plugin-zip` derives the ZIP version from that header first

So the app can claim “1.5.9” while the downloadable package still installs as `1.5.7`. That is why WordPress says the old plugin is `.7` and the replacement is also `.7`.

### Important root cause
`supabase/functions/serve-plugin-zip/index.ts` is the actual packaged source for downloads. It contains an embedded `PLUGIN_FILES` map, and `extractPluginVersion()` reads:

1. the `Version:` header first
2. only falls back to `MM_PLUGIN_VERSION` if the header is missing

That means updating only constants is not enough. The header must be corrected in the shipped main plugin file, and the embedded ZIP builder content must match.

### Implementation plan

1. **Fix the shipped plugin header to 1.5.9**
   - Update the main plugin header in:
     - `supabase/functions/serve-plugin-zip/plugin-template/mission-metrics.php`
     - `mission-metrics-wp-plugin/mission-metrics.php`
   - Set both:
     - `Version: 1.5.9`
     - `MM_PLUGIN_VERSION = 1.5.9`

2. **Fix the actual ZIP builder payload**
   - Update the embedded `mission-metrics.php` content inside:
     - `supabase/functions/serve-plugin-zip/index.ts`
   - This is the critical fix, because this edge function is what users are actually downloading.
   - After this, `extractPluginVersion()` will produce `1.5.9`, so the ZIP filename and packaged plugin metadata will finally match.

3. **Sync frontend download metadata**
   - Update `src/lib/plugin-download.ts`
   - Change `LATEST_PLUGIN_VERSION` from `1.5.7` to `1.5.9`
   - This keeps download labels and fallback filenames aligned with the real package.

4. **Clean up version metadata for consistency**
   - Update `mission-metrics-wp-plugin/readme.txt` stable tag to `1.5.9`
   - Review `supabase/functions/serve-plugin-zip/plugin-template/readme.txt` so changelog/stable tag reflect the same release
   - No database or auth changes are needed

### Technical notes
- WordPress determines plugin version from the main plugin file header comment, not from internal constants alone.
- The ZIP builder currently uses the packaged main file header to set `Content-Disposition`, so stale headers cause stale filenames too.
- `plugin-update-check` is already on `1.5.9`; the bug is that the downloadable artifact is still built from `1.5.7` metadata.

### Verification after implementation
1. Download the plugin from the app
2. Confirm the ZIP filename is `actv-trkr-1.5.9.zip`
3. Open the ZIP and verify `actv-trkr.php` shows:
   - `Version: 1.5.9`
   - `MM_PLUGIN_VERSION` = `1.5.9`
4. Upload to WordPress and confirm the replacement prompt says existing `1.5.7` → new `1.5.9`
5. Confirm the in-app “update available” warning clears after the site reports the new version
