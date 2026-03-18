
Root cause is now clear from runtime evidence, and it’s not your fault:

1) Why this is still broken
- The WordPress sync endpoint is crashing before sync can run:
  - `trigger-site-sync` logs show: `syntax error, unexpected 'foreach'` in `wp-content/plugins/actv-trkr/includes/class-forms.php` line 24.
- When that crash happens, backend falls back to form-health checks only (not entry ingestion), so entries do not update.
- Database confirms this for your target form:
  - `Book In-Office` (`external_form_id=434`) has `0` raw events and `0` leads.
- Separate issue affecting visible rows:
  - Recent Avada backfill rows have `fields: []` and bad numeric `submitted_at` values (e.g. `154`), which is why UI shows mostly Date/Source with no real field columns.

2) Implementation plan
A. Fix the broken distributed plugin package (highest priority)
- Patch `supabase/functions/serve-plugin-zip/index.ts` generated `AT_Forms::get_active_entry_ids` syntax (the malformed `if((!is_array($rows)||empty($rows)){...` block) and scan for similar malformed conditions.
- Release a new plugin version (v1.3.18) in:
  - `serve-plugin-zip`
  - `plugin-update-check` (version + changelog)

B. Make plugin generation safer so this cannot regress
- Replace fragile minified one-line PHP block generation for `class-forms.php` with readable, structured string content (or single-source shared plugin code).
- Add a build-time smoke check in this repo that validates generated zip text for known bad token patterns before release.

C. Fix backfill data quality (Date/Source-only rows)
- In generated `handle_rest_backfill_avada`:
  - Improve timestamp resolution (more timestamp columns + parse timestamp from submission payload when needed) so `submitted_at` is real time, not row id.
  - Expand field extraction fallback across payload shapes (JSON + serialized + nested arrays + additional likely columns).
- In `supabase/functions/ingest-form/index.ts`:
  - Add duplicate guard using `(org_id, site_id, form_id, external_entry_id)` existence before inserting into `leads`, to avoid duplicate leads on repeated backfills.

D. Surface hard failure correctly in UI
- In `trigger-site-sync`, when WP `/sync` returns 500, return explicit blocked status (`sync_status: "blocked"`, reason `wp_plugin_fatal`) instead of appearing “ok”.
- In `src/pages/Forms.tsx` `handleSyncAll`, treat `fallback + wp_error` as failed sync toast (not success).

3) Recovery flow after deployment
- Install updated plugin v1.3.18 on WordPress.
- Run global “Sync Entries”.
- Verify diagnostics include form `434`.
- If needed, run one controlled Avada backfill after syntax fix.
- Rebuild missing flat fields for recent Avada leads where raw payload has recoverable data.

4) Success criteria
- `trigger-site-sync` no longer returns fallback for your site.
- `sync-entries` logs show `form=434` with non-zero active entries.
- DB: Book In-Office has non-zero `lead_events_raw` + `leads`.
- UI: Book In-Office entries show real field columns (not just Date/Source).
