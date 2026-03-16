
Issue summary (confirmed live):
- The site is still running an old plugin build during sync (`runtime_plugin_version: 1.3.5` in `trigger-site-sync` response).
- `sync-entries` is still logging: “ALL 6 Avada forms report 0 active entries”, so reconciliation is being skipped.
- The auto-update endpoint is currently unreachable from backend (`/plugin-update-check` returns 404), so waiting won’t update anything.
- Update cadence is also too slow by design (`CHECK_HOURS=12` in updater code), which makes “wait and retry” unreliable.

Plan to close this permanently (both immediate and long-term):

1) Restore update channel reliability
- Deploy/repair the `plugin-update-check` backend function and verify both:
  - `?action=info` returns version metadata
  - `?action=check&version=1.3.5&domain=...` returns `has_update=true`
- Add a post-release smoke test step so we never ship with update endpoint missing again.

2) Remove stale-download risk in dashboard
- Update plugin download flow to always bypass cache (`no-store` + timestamp query param).
- Use `Content-Disposition` filename (versioned zip) instead of hardcoded `actv-trkr.zip`.
- Show downloaded version in the success toast so user sees exactly what they got.

3) Make updater check much faster
- In WordPress updater code (both plugin source and generated zip template):
  - reduce update transient window from 12h to a short interval
  - add a force-refresh path (clear updater transient on demand from plugin settings/plugins page)
- Keep standard background checks, but ensure manual checks are immediate.

4) Stop false “Sync complete” when plugin is outdated
- In `trigger-site-sync`, classify as `partial/blocked` when plugin version is below Avada-safe minimum, even if warnings array is empty.
- Return explicit reason codes (e.g. `plugin_outdated`, `avada_discovery_empty`) so UI can show the right message deterministically.
- In Forms UI, treat these reason codes as non-success states with persistent warning banner.

5) Version truth and validation hardening
- Keep `runtime_plugin_version` as authoritative when provided by WordPress.
- If missing, mark source as fallback (heartbeat/db), so we don’t overstate certainty.
- Validate with end-to-end checks:
  1. Update plugin on site and confirm sync response shows `runtime_plugin_version=1.3.8`
  2. Re-run sync and confirm no “ALL Avada forms empty” logs
  3. Delete one Avada entry in WordPress and verify exactly one entry is trashed in Forms
  4. Confirm UI no longer shows “Sync complete” when update/discovery is not healthy

Files to update:
- `src/components/settings/PluginSection.tsx`
- `src/lib/plugin-download.ts`
- `mission-metrics-wp-plugin/includes/class-updater.php`
- `supabase/functions/serve-plugin-zip/index.ts` (embedded updater + download behavior)
- `supabase/functions/trigger-site-sync/index.ts`
- `src/pages/Forms.tsx` (status/banner handling)

No database schema changes required.
