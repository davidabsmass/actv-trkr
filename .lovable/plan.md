
Goal
- Make Avada entry reconciliation actually trustworthy (no silent “success” when Avada wasn’t checked), and stop stale/deleted entries from lingering in Forms.

What I verified just now
- Your selected form (`cf30b539...`) is Avada (`external_form_id=10102`, “Patient General”).
- Latest runtime logs from `sync-entries` show:
  - `ALL 6 Avada forms report 0 active entries`
  - `safety_guard_active=true -> skipping` for each Avada form
- So right now Avada reconciliation is intentionally skipped (to avoid destructive mistakes), which is why deleted WP entries stay visible.
- Site record currently reports plugin `1.3.5`, and recent Avada submissions in raw events still show older plugin versions (`1.3.1/1.2.0`) and mostly legacy IDs (`avada_*`), confirming outdated plugin behavior in production flow.

Why it feels like “it’s not checking Avada”
- It is attempting to check, but Avada discovery returns zero active entries, so backend safety blocks reconciliation.
- UI currently still reports “Sync complete” too optimistically in Form Detail, creating a trust gap.

Implementation plan (no gaps)
1) Fail-loud sync status for Avada (stop false “success”)
- In `trigger-site-sync`, classify result as:
  - `sync_status: ok | partial | blocked`
  - `blocked` when Avada payload is unusable (all-empty / safety-guard path).
- Return explicit machine-readable diagnostics (not just free-text warning).

2) Surface diagnostics everywhere in Forms UI
- In `src/pages/Forms.tsx`:
  - Form list sync and Form Detail sync must both show backend warnings from `wp_result.result.warnings`.
  - If `sync_status=blocked`, show error toast + persistent inline banner on Forms page (not only transient toast).
  - Replace generic “Sync complete” with “Sync partially completed” when Avada was skipped.

3) Harden Avada discovery in WordPress plugin (next patch, v1.3.8)
- In `mission-metrics-wp-plugin/includes/class-forms.php` (and mirrored `serve-plugin-zip` template):
  - Expand Avada table/column strategy beyond current assumptions:
    - Candidate form-ref columns (not only `form_id`)
    - Candidate payload columns (not only `submission`)
    - Robust matching for form ID and URL markers in blob/json text
  - Add per-form discovery diagnostics (strategy used + row count) to sync response.
  - Keep global fallback removed (safety stays).

4) Add runtime version truth to sync payload
- Include plugin runtime version in `/sync` payload response so backend/UI stop relying on stale `sites.plugin_version`.
- Use this runtime version to gate messaging and prompt update accurately.

5) Tighten success criteria
- `scan_all_forms()` should return:
  - `trashed`, `restored`, `warnings`, `avada_diagnostics`
- `trigger-site-sync` should pass these through unchanged.
- UI should only show “up to date” when:
  - no warnings
  - no blocked/partial status
  - reconciliation actually evaluated Avada inputs.

Files to update
- `mission-metrics-wp-plugin/includes/class-forms.php`
- `supabase/functions/serve-plugin-zip/index.ts`
- `supabase/functions/trigger-site-sync/index.ts`
- `src/pages/Forms.tsx`
- (if needed for messaging consistency) `supabase/functions/plugin-update-check/index.ts`

No backend schema/RLS migration needed.

Validation plan
1) Trigger sync from Form Detail and from Forms list.
2) Confirm UI shows “blocked/partial” (not success) when Avada discovery is empty.
3) Confirm diagnostics include per-Avada-form entry counts.
4) After plugin update, rerun sync and verify Avada forms report non-zero active entries.
5) Delete one known Avada entry in WordPress, sync again, confirm exactly that entry becomes `trashed` and disappears from Forms.
