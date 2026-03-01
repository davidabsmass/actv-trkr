

## Plan: Auto-Discover Forms Before First Submission

### Problem
Forms only appear in the Entries area after their first lead submission arrives. You want to see all forms from your WordPress site immediately, even with zero submissions.

### Solution
Add a form sync mechanism: the WordPress plugin scans all installed form plugins (Gravity Forms, CF7, WPForms, etc.) and registers them with your backend automatically — no submission required.

### Changes

**1. New edge function: `sync-forms`**
- Accepts an array of `{ form_id, form_title, provider }` from the plugin
- Authenticates via API key (same as other ingest endpoints)
- Upserts each form into the `forms` table (creates if missing, updates name if changed)
- Returns count of synced forms

**2. WordPress plugin: add form discovery in `class-forms.php`**
- New static method `scan_all_forms()` that queries each supported plugin's API:
  - Gravity Forms: `GFAPI::get_forms()`
  - CF7: `WPCF7_ContactForm::find()`
  - WPForms: `wpforms()->form->get()`
  - Ninja Forms: `Ninja_Forms()->form()->get_forms()`
  - Fluent Forms: `wpFluent()->table('fluentform_forms')->get()`
- Sends discovered forms to the `sync-forms` edge function
- Triggered automatically on WP admin page load (once per 6 hours, tracked via a transient)

**3. WordPress plugin: add "Scan Now" button in settings page**
- Add a manual "Sync Forms" button in `class-settings.php` that calls `scan_all_forms()` via AJAX
- Shows result count to the user

**4. Update Entries UI empty state**
- Change the "No forms connected yet" message to mention that forms sync automatically from the plugin, or can be triggered manually from WordPress settings

### Technical Details

- The `sync-forms` edge function uses the same API key auth pattern as `ingest-form` and `ingest-gravity`
- Form upsert uses the composite key `(org_id, site_id, external_form_id)` to avoid duplicates
- The WP transient `actv_trkr_last_form_sync` prevents excessive scanning (6-hour cooldown)
- No database schema changes needed — the existing `forms` table already supports this

