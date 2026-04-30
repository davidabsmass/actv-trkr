Yes — I can fix this, and I agree it has to be treated as a launch blocker, not a “patch and hope” issue.

The important finding from inspection is this: the latest parser fix can correctly parse newly re-sent Avada entries, but the backend currently deduplicates existing entries and then refuses to overwrite their already-stored field rows. That means the bad Apyx rows can stay scrambled even after the plugin is fixed and even after WordPress re-sends them. That is why this has felt like it is not getting clean.

Also: the live logs show `livesinthebalance.org` still has a count mismatch on Gravity Form 7: WordPress reports 1353 active entries while the app has 1352. Apyx still has 9 Avada leads with `Field 11` / similar labels in the app copy.

Nothing in this plan writes to or deletes from WordPress. WordPress remains read-only and is the source of truth.

## Plan

### 1. Stop relying on dashboard-row deletion for healing
I will change the backend ingestion path so a trusted WordPress backfill can refresh an existing mirrored lead instead of being blocked by deduplication.

Specifically, when an incoming backfill payload matches an existing lead by canonical WordPress entry ID:

- Update the dashboard lead’s mirrored `data.fields` from the fresh WordPress payload.
- Replace that lead’s `lead_fields_flat` rows in Lovable Cloud only.
- Keep the same lead record and same count.
- Only do this for WordPress-origin backfill payloads, not random client-side submissions.
- Prefer the richer/correct payload when the existing stored fields contain generic `Field 11`, `Field 12`, etc., or when the incoming field set is more complete.

This gives us a safe “heal in place” mechanism. It does not delete WordPress entries, and it avoids deleting dashboard lead rows unless absolutely necessary.

### 2. Harden Avada/Fusion field extraction
I will bump the plugin to a new version and make Avada backfill use the most authoritative field source available.

Changes:

- Prefer Avada’s secondary submission-field table when present, because it stores field rows separately and avoids comma-splitting problems.
- Use primary CSV/blob parsing only as fallback.
- Preserve real field order.
- Avoid label/value drift when hidden, checkbox, consent, captcha, submit, or HTML fields appear mid-form.
- Keep consent-type fields from shifting the rest of the entry.
- Ensure old mirrored rows can be refreshed through the backend fix above.

### 3. Expand historical backfill for the major plugins
The plugin currently discovers more providers than it fully backfills. I will close that gap.

Target providers for count + entry parity:

- Gravity Forms
- Avada / Fusion Forms
- WPForms
- Contact Form 7, when Flamingo stores entries
- Ninja Forms
- Fluent Forms

Provider-specific fixes:

- Ninja Forms: scope stored submissions to the specific form instead of risking cross-form counts.
- Fluent Forms: fix the status query so unread submissions from other forms cannot be counted for the wrong form.
- CF7: backfill from Flamingo where available; clearly treat CF7 without Flamingo as “no stored historical entries available in WordPress”.
- WPForms and Gravity Forms: keep cursor-based paginated backfill so large sites do not time out.

### 4. Make count parity deterministic and safer under load
I will adjust the backfill orchestration so the app does not hammer WordPress during large imports.

Current logs show `livesinthebalance.org` hit WordPress `429 Too Many Requests` during continuation backfills. I will:

- Remove/reduce competing parallel backfill workers that can trigger rate limits.
- Make continuation more conservative.
- Treat WordPress rate limiting as “pause and continue later”, not as a silent partial success.
- Keep WordPress entry IDs as the authority for app counts.
- After each sync, compare:
  - WordPress active entry count
  - App active mirrored lead count
  - Missing canonical entry IDs
  - Duplicate canonical entry IDs

### 5. Heal the two affected live sites after the code is fixed
After the ingestion/backfill changes are in place, I will run a forced WordPress-origin re-sync/backfill for:

- `apyxmedical.com`
- `livesinthebalance.org`

Expected results:

- Apyx: the 9 scrambled Avada mirrored entries are refreshed in place from WordPress using the fixed parser.
- Lives in the Balance: Gravity Form 7 is backfilled until app count matches the 1353 active entries WordPress reports.
- No WordPress entries are deleted or edited.
- Any replacement of field rows happens only inside the dashboard mirror.

### 6. Verification before calling it done
I will verify with database reads and logs:

- Apyx Avada forms have zero active app entries containing `Field 1N` generic scrambled labels.
- Apyx Avada active counts match WordPress-reported entry IDs.
- Lives in the Balance Gravity Form 7 app count matches the WordPress count.
- No duplicate active app leads exist for the same canonical WordPress entry ID.
- Backfill logs show successful batches with no persistent 429/timeout loop.

### 7. Release packaging
Because this touches the WordPress plugin, I will follow the plugin version rules:

- Bump the plugin version.
- Regenerate plugin artifacts with `scripts/plugin-artifacts.mjs`.
- Update the latest zip, plugin manifest, update-check function, and serve-zip function together.

## Technical details

The key code areas I will change are:

- `supabase/functions/ingest-form/index.ts`
  - Add safe existing-lead refresh for trusted backfills.
  - Replace stale mirrored field rows when the incoming WordPress payload is authoritative.

- `mission-metrics-wp-plugin/includes/class-forms.php`
  - Harden Avada extraction.
  - Add missing backfill adapters for CF7/Flamingo, Ninja Forms, and Fluent Forms.
  - Fix provider-specific count scoping.

- `supabase/functions/trigger-site-sync/index.ts`
  - Make continuation/backfill less aggressive and more rate-limit aware.
  - Improve parity reporting after sync.

- Plugin artifact outputs
  - Regenerated automatically after the version bump.

## Safety commitment

I will not perform any write/delete operation against the connected WordPress sites. The only changes are:

- Code changes to the ACTV TRKR plugin and backend functions.
- Dashboard mirror repairs inside Lovable Cloud.
- Read-only pulls from WordPress to rebuild the dashboard mirror from the client’s true WordPress entries.