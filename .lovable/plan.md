
Goal: stop Avada leads from being mass-trashed again, restore all affected Avada entries, and ship a safer sync release.

What I confirmed
- Your selected form is Avada (`Patient General`, external ID `10102`).
- In backend data, all Avada leads for your org are currently `status='trashed'` (46/46).
- Runtime logs show the root cause clearly:
  - each Avada form reports the same active set (`active=87`, `timestamps=87`)
  - sync then computes `to_trash = raw` for every Avada form
- This is caused by the plugin’s Avada “global fallback” returning all submission rows for each form.

Your selected recovery choices
- Recovery scope: Restore all Avada leads
- Rollout order: Both in one release

Implementation plan
1) Immediate containment in backend sync logic
- Update `sync-entries` to detect suspicious Avada payloads and skip destructive reconciliation:
  - identical/near-identical active ID sets across multiple Avada forms
  - full-trash pattern (`to_trash === rawEvents.length` with zero reliable matches)
- Return explicit warning messages when a safety guard activates.

2) Fix WordPress Avada discovery (primary bug)
- In `mission-metrics-wp-plugin/includes/class-forms.php`, remove the global Avada fallback (all-table rows).
- Keep only scoped methods:
  - direct `form_id` match
  - `submission` URL match when page URL exists
- If neither strategy can confidently scope rows, return empty for that form (safe failure).

3) Keep generated downloadable plugin in sync
- Apply the same Avada fix in `supabase/functions/serve-plugin-zip/index.ts` (embedded plugin template).

4) Restore affected data in the same rollout
- Run a targeted data repair to restore all Avada leads for the impacted org from `trashed -> new`.
- This aligns with your requested recovery scope.

5) Release/version alignment
- Bump plugin version to `1.3.7` in:
  - `mission-metrics-wp-plugin/mission-metrics.php`
  - `supabase/functions/serve-plugin-zip/index.ts`
  - `supabase/functions/plugin-update-check/index.ts` (+ changelog text)
  - `mission-metrics-wp-plugin/readme.txt` stable tag/changelog
- Update `trigger-site-sync` warning text to recommend `v1.3.7+`.

6) Surface safety warnings in dashboard sync UX
- Ensure warnings from sync are bubbled through to Forms UI toast so users see “destructive sync skipped for safety” instead of a silent zero-trash result.

Technical details
- No schema migration needed.
- No RLS changes needed.
- Files to edit:
  - `supabase/functions/sync-entries/index.ts`
  - `mission-metrics-wp-plugin/includes/class-forms.php`
  - `supabase/functions/serve-plugin-zip/index.ts`
  - `supabase/functions/trigger-site-sync/index.ts`
  - `supabase/functions/plugin-update-check/index.ts`
  - `mission-metrics-wp-plugin/mission-metrics.php`
  - `mission-metrics-wp-plugin/readme.txt`
  - `src/pages/Forms.tsx` (if warning propagation needs UI handling)

Validation plan (end-to-end)
```text
1) Run sync on affected site
2) Confirm Avada no longer reports identical global active sets
3) Confirm no mass-trash occurs
4) Delete one Avada entry in WordPress
5) Sync Entries
6) Verify exactly that entry becomes trashed and disappears in Forms
7) Verify remaining Avada entries stay visible
```
