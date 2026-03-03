

## Simplify Plugin Section — Remove Endpoint URL

### Problem
The Plugin Section in Settings shows an "Endpoint URL" with a copy button. This is an internal backend detail that users never need to touch — the plugin already has it hardcoded as the default. Showing it creates confusion and makes the setup feel more complex than it is.

### Changes

**`src/components/settings/PluginSection.tsx`**
- Remove the entire "Connection Settings" block (endpoint URL display + copy button)
- Simplify to show only:
  - Download Plugin button (already exists)
  - API Key Status indicator (already exists)
  - Simple instruction: "Download the plugin, upload it to WordPress, then paste your API key in Settings → ACTV TRKR."
- Remove the `endpointUrl` variable and related copy logic

One file changed. No database or routing changes needed.

