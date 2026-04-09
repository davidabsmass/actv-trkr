
Direct answer

You are right: if WordPress says Book In-Office has 12 entries, the app is wrong. This is not a small UI bug. It is a data-identity bug in the Avada pipeline, and I have only fixed pieces of it so far instead of fully removing the root cause.

Why this has not been working

1. The app is counting exactly what is in the database, not inventing 26.
- In `src/pages/Forms.tsx`, the form count is an exact all-time count of active `leads` for that `form_id`.
- So the “26” is not a display math bug. It means 26 active rows are currently stored under Book In-Office.

2. Book In-Office currently contains mixed Avada data from two different pipelines.
Current database state for Book In-Office (`forms.id = 5e5b0b68...`, Avada external form `434`):
- 26 active leads total
- 19 canonical DB-style Avada leads: `avada_db_*`
- 7 legacy hook-style Avada leads: `avada_*`

That alone explains part of the inflation: old legacy rows are still active alongside newer DB-backed rows.

3. There are confirmed duplicates for the same submission moments.
I found multiple exact timestamp pairs where both of these exist at the same time:
- one `avada_*` lead
- one `avada_db_*` lead

That means the same submission was stored twice under two different ID formats.

4. The columns are “messed up” because the underlying data for Book In-Office is mixed, not because the table component is random.
For the same Book In-Office form, the stored field schemas are split into two families:
- 11 entries in the older numeric/relabeled schema family: `Name / Email / Phone / Company / Quantity` (original keys `28-32`)
- 8 entries in a different schema family: `Name / Email / Phone / Category / City`

That is why the entries table keeps sprouting the wrong columns.
`src/lib/form-field-display.ts` is explicitly designed to show all stored field data and merge every label it sees. So once wrong submissions are attached to the form, the UI faithfully exposes the damage.

5. I fixed secondary bugs, but not the one strict rule this needs.
The previous fixes were real, but partial:
- provider collision fix in `ingest-form`
- plugin version/download fixes
- safer sync logic in `sync-entries`
- label patch migrations for numeric Avada fields

Those helped symptoms, but they did not fully solve the core problem:
the Avada system still does not use one strict, authoritative identity path from WordPress entry -> app lead.

6. The WordPress plugin is still too permissive when discovering Avada entries.
In `mission-metrics-wp-plugin/includes/class-forms.php`, `get_active_entry_ids()` for Avada:
- scans multiple candidate tables
- tries fallback strategies like page URL matching, blob searching, title matching, token matching, slug matching
- merges results across tables

That recovery strategy was built to avoid missing data on weird Avada installs. But it is too fuzzy for exact parity. On your site, that permissiveness is likely pulling in entries that do not truly belong to Book In-Office.

7. The backend is still protecting old Avada rows that should no longer stay active.
In `supabase/functions/sync-entries/index.ts`, Avada rows are still protected with:
- `shouldProtectRawOnlyLeads = provider === "avada"`

That means legacy `avada_*` rows can remain active even after canonical `avada_db_*` rows exist. That protection made sense while IDs were unstable, but it blocks exact counts now.

8. I also used label-fix migrations as a band-aid.
There are manual migrations specifically relabeling Avada numeric fields:
- `20260330090735...`
- `20260330151508...`

Those improve readability for already-stored rows, but they do not stop future bad rows from being created. So the columns “break again” after another backfill/rescan.

Concrete fix plan

Phase 1 — Stop creating wrong Avada rows
1. Make Avada counting strict in the WordPress plugin.
Files:
- `mission-metrics-wp-plugin/includes/class-forms.php`
- mirrored copy in `supabase/functions/serve-plugin-zip/plugin-template/includes/class-forms.php`

Changes:
- Split “Avada count source” from “Avada field enrichment source”.
- For counts and active entry lists, use only the resolved authoritative submission source after post ID -> internal Avada form ID is resolved.
- Do not use auxiliary/fuzzy matches as active-entry truth.
- Use secondary tables only to enrich fields after a valid submission row is already known.
- If the plugin cannot resolve a trusted internal form ID, return a blocked/mismatch state instead of guessing.

This is the most important fix.

2. Tighten backend reconciliation so legacy Avada rows do not live forever.
File:
- `supabase/functions/sync-entries/index.ts`

Changes:
- Keep temporary Avada protection only when there is no canonical DB-backed match yet.
- If a canonical `avada_db_*` row exists for the same submission, merge/trash the legacy `avada_*` row.
- Do not let protected raw-only Avada rows count toward parity once canonical IDs are available.
- Make the sync fail loudly if `wp_count !== app_count` after reconciliation.

3. Prevent duplicate lead creation during Avada backfill.
File:
- `supabase/functions/ingest-form/index.ts`

Changes:
- On Avada ingest, if a legacy `avada_*` lead already exists for the same form + same submission fingerprint, upgrade/merge it instead of inserting a second lead.
- Preserve the richer row, but normalize to the canonical `avada_db_*` identity.
- Rebuild `lead_fields_flat` for the surviving canonical row if needed.

Phase 2 — Repair the bad data already stored
4. Run a one-time repair for the affected Avada forms, starting with Book In-Office.
Repair steps:
- Pull the authoritative entry list from WordPress using the new strict plugin logic.
- Compare it against active app leads for each Avada form.
- Trash legacy `avada_*` duplicates that have canonical replacements.
- Trash canonical rows that do not belong to the authoritative Book In-Office submission set.
- Rebuild `lead_fields_flat` only for the surviving canonical rows.

For Book In-Office specifically, the target after repair is:
- app count matches WordPress exactly
- no active legacy duplicates remain
- no cross-schema contamination from other Avada rows remains

5. Rebuild field labels from canonical data, not manual patches.
Instead of relying on one-off SQL relabeling:
- normalize weak numeric labels only during canonical Avada rebuild
- use the per-form schema/template path already present in `ingest-form`
- keep this narrow and deterministic, not a broad parser rewrite

Phase 3 — Make Rescan trustworthy
6. Make Rescan return a real per-form audit.
Files:
- `supabase/functions/trigger-site-sync/index.ts`
- `src/pages/Forms.tsx`

Changes:
- return per-form audit data like:
  - form name
  - wp count
  - app count before
  - app count after
  - resolved internal Avada ID
  - strategy used
  - whether legacy rows were merged
- if any form still mismatches, do not show a success toast
- surface the mismatched forms directly in the UI

That way “Rescan” becomes proof, not just a button that fires background work.

7. Keep the daily 7am Eastern sync, but turn it into a parity audit too.
After the strict fix is in place:
- daily sync should store/report exact per-form parity
- any mismatch should create an internal alert instead of silently accepting drift

Technical details

Root causes, in one line each:
- Count inflation: mixed `avada_*` + `avada_db_*`
- Wrong form attachment: fuzzy Avada matching in plugin discovery/backfill
- Wrong columns: mixed schemas stored under one `form_id`
- Regression after “fixes”: manual label patches treat symptoms, not identity

Files that matter most:
- `mission-metrics-wp-plugin/includes/class-forms.php`
- `supabase/functions/serve-plugin-zip/plugin-template/includes/class-forms.php`
- `supabase/functions/sync-entries/index.ts`
- `supabase/functions/ingest-form/index.ts`
- `supabase/functions/trigger-site-sync/index.ts`
- `src/pages/Forms.tsx`
- `src/lib/form-field-display.ts`

Important implementation rule:
- when the plugin changes, update both plugin code paths and the served ZIP/template together so the download always ships the same logic

Success criteria

I would consider this fixed only when all of these are true:

1. Book In-Office app count equals the WordPress count exactly.
2. There are no active duplicate legacy/canonical Avada rows for the same submission.
3. The Book In-Office entries table no longer shows mixed columns from unrelated submissions.
4. Rescan returns a per-form audit proving parity, not just a generic success message.
5. The next daily 7am Eastern run keeps the same count without drifting back.

Bottom line

The reason I have not gotten this right yet is that I was still letting the Avada pipeline behave like a “best-effort recovery system” instead of a strict source-of-truth system. That protected against data loss, but it is exactly why you are seeing wrong counts and broken columns. The fix is to remove the fuzzy paths from the counting identity flow, merge/trash the old legacy Avada rows, rebuild the affected forms from authoritative WordPress data, and make Rescan prove parity before claiming success.
