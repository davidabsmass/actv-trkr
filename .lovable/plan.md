
Goal: fix why deleted Avada entries still show in Forms.

What I verified
- The selected form is Avada (`Patient General`, external_form_id `10102`) and currently has 15 active leads in backend.
- A live sync call succeeded (`trigger-site-sync`), but returned `trashed: 0`.
- `sync-entries` logs show the core issue:
  - all Avada forms are sending `active=0`
  - backend safety guard detects this and skips destructive reconciliation (`allAvadaEmpty=true`), so deleted entries are not trashed.
- You confirmed deletions are done in Avada Form Entries and “Save To Database” is enabled.

Why this is happening
- Deletion sync depends on WordPress sending active entry IDs/timestamps.
- For Avada, the plugin is failing to read active entries (returns empty arrays for every Avada form), so backend intentionally refuses to trash anything to prevent another mass-delete incident.

Implementation plan
1) Harden Avada active-entry lookup in the WordPress plugin (primary fix)
- Update Avada lookup logic to support schema/env variations instead of assuming one exact table/column shape.
- Add multi-strategy lookup:
  - candidate submission tables/prefixes
  - dynamic timestamp column detection
  - direct form_id match
  - URL/blob fallback match when direct match fails
- Ensure Avada sync payload always includes `entry_ids` + `entry_timestamps` when entries exist.

2) Improve Avada page URL discovery before sync
- Expand form-page detection for Avada embeds (shortcodes/builder patterns), so URL fallback has reliable input.

3) Keep safety, but add actionable warnings
- Keep existing all-Avada-empty safety skip (prevents accidental mass trashing).
- Return explicit warnings from sync when Avada entry discovery fails.
- Surface those warnings in the Forms UI toast so users see exact reason instead of “sync complete”.

4) Keep plugin code paths in sync
- Apply the same Avada fixes in both plugin code sources used here:
  - `mission-metrics-wp-plugin/includes/class-forms.php`
  - `supabase/functions/serve-plugin-zip/index.ts` (embedded plugin template)
- Bump plugin version (e.g., `1.3.6`) so sites can receive the corrected logic cleanly.

5) Validate end-to-end before rollout
- Trigger sync and confirm logs show Avada forms with `active > 0` (not all zero).
- Delete one known entry in Avada, run Sync Entries, confirm:
  - `trashed` increments
  - lead status changes to `trashed`
  - entry disappears from Forms table (which already filters `status != trashed`).

Technical details (for implementation)
- Files to update:
  - `mission-metrics-wp-plugin/includes/class-forms.php` (Avada entry discovery + page URL enrichment)
  - `supabase/functions/serve-plugin-zip/index.ts` (same plugin logic in generated zip)
  - `supabase/functions/sync-entries/index.ts` (warning payload when Avada active list is unusable)
  - `src/pages/Forms.tsx` (display sync warnings from backend response)
- No database schema migration required.
- No RLS changes required.

Execution flow after fix
```text
Avada Entry Delete
  -> WordPress plugin sync builds real active IDs/timestamps
  -> /sync-entries compares against stored leads
  -> matching deleted leads set status='trashed'
  -> Forms query excludes trashed
  -> deleted entries disappear from UI
```
