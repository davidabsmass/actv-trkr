
Root cause is now clear from runtime data, not guesswork:

1) The selected form is Avada (`form_id=cf30...`, `external_form_id=10102`), but the WordPress sync response returns `discovered: 1` for the whole site even though the site has multiple active Avada forms.  
2) `lead_events_raw` for that form uses legacy IDs (`avada_...`), and all corresponding leads are still `status='new'` (no trashed rows).  
3) The Avada payload already contains a stable DB entry number inside the `submission` field (`..., 10118, ...`), but current reconciliation does not use it.  
4) Plugin distribution is inconsistent: some app flows still download from `serve-plugin-zip`/`plugin-update-check` that are pinned to older behavior/versioning, which keeps reintroducing outdated sync logic.

Implementation plan:

## 1) Fix Avada inclusion in WordPress sync payload
- Update `mission-metrics-wp-plugin/includes/class-forms.php`:
  - Add Avada form discovery to `scan_all_forms()` so Avada forms are included in `sync-forms` and `sync-entries`.
  - Add Avada discovery to `discover_forms_list()` fallback path too.
- Outcome: dashboard-triggered sync will actually send Avada forms to `sync-entries` (currently it often doesn’t).

## 2) Fix Avada entry identity so deletes can be matched
- In `handle_avada()`, extract DB entry id from `submission` metadata when present (the 4th token in current payload pattern), and emit canonical `entry_id` as `avada_db_<id>`.
- Keep current fallback only when extraction fails.
- Outcome: new Avada submissions stop generating only legacy `avada_<rand>` IDs.

## 3) Make backend reconciliation work for existing legacy rows
- Update `supabase/functions/sync-entries/index.ts`:
  - Read `payload` from `lead_events_raw` for Avada rows.
  - If `external_entry_id` is legacy (`avada_...`), derive canonical candidate `avada_db_<id>` from payload `submission`.
  - Compare against active entry set using derived canonical ID before deciding trash/restore.
  - Preserve current safety behavior for providers where canonical derivation is unavailable.
- Outcome: historical rows like the one you cited can be trashed correctly once deleted in WordPress.

## 4) Unify plugin delivery so users always install the fixed build
- Update all plugin distribution/version points together:
  - `mission-metrics-wp-plugin/mission-metrics.php` + `readme.txt` (bump to next patch, e.g. 1.3.4).
  - `supabase/functions/plugin-update-check/index.ts` (`LATEST_VERSION`, changelog).
  - `supabase/functions/serve-plugin-zip/index.ts` (same version and Avada sync fixes), OR route all in-app download buttons to the same static packaged zip source.
- Update app UI download surfaces (`PluginSection`, `WebsiteSetup`) to the unified source.
- Outcome: no more “uploaded again but still old behavior” drift.

## 5) Improve UX/error messaging in Forms sync
- Update `src/pages/Forms.tsx`:
  - Stop hardcoded “ensure v1.3.2 is active”.
  - Surface backend `plugin_warning` directly in toast.
  - Keep sync success summary, but include explicit “Avada reconciliation ran” when applicable.
- Outcome: users see the actual version mismatch and reconciliation state.

Technical details (targeted):
- No database migration required.
- Main code touchpoints:
  - `mission-metrics-wp-plugin/includes/class-forms.php`
  - `supabase/functions/sync-entries/index.ts`
  - `supabase/functions/plugin-update-check/index.ts`
  - `supabase/functions/serve-plugin-zip/index.ts`
  - `src/pages/Forms.tsx`
  - optionally `src/components/settings/PluginSection.tsx`, `src/pages/WebsiteSetup.tsx`

Validation plan after implementation:
1) Trigger `trigger-site-sync` for site `dca0794b-...` and confirm `wp_result.result.discovered` includes Avada forms (not just 1 gravity form).  
2) Confirm `wp_result.result.trashed` increments when an Avada entry is deleted in WordPress.  
3) Verify the specific lead around `2026-03-10 10:10:31+00` for this form transitions from `new` to `trashed`.  
4) Re-run sync to ensure idempotency (no oscillation/new false positives).  
5) Confirm plugin warning/version text reflects the current required version.
