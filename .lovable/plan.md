

## The Problem — Why "Sync Entries" Doesn't Re-pull Data

You're right to be frustrated. Here's the plain-english explanation:

**How entries get in the first time**: When someone submits an Avada form on your WordPress site, the plugin's `handle_avada()` hook fires *in real time*. It reads the form data directly from the live submission, packages it with all the field values (name, email, phone, etc.), and POSTs it to the `ingest-form` endpoint. That's why initial entries have real data.

**What "Sync Entries" actually does**: It calls `trigger-site-sync`, which tells WordPress to run `scan_all_forms()`. That function:
1. Discovers which forms exist (form names, providers) → sends to `sync-forms`
2. Gathers a **list of entry IDs** per form → sends to `sync-entries`

The `sync-entries` endpoint only compares IDs. It marks entries as "trashed" if their ID disappeared from WordPress, or "restored" if they reappear. **It never re-fetches field data.** It's a trash/restore reconciliation tool, not a reimporter.

**The backfill path exists but only fires in one condition**: The `trigger-site-sync` function *does* call `backfill-avada` — but only when `avadaActiveLeadCount === 0 && avadaRawEventCount === 0` (zero existing data) OR when `requires_avada_reset` is true. Since your forms already have entries (just with empty fields), backfill never triggers.

**Why existing entries show "Mar 18 · direct" with no field data**: Those entries were created by the backfill that ran after the reset. The backfill calls `extract_avada_backfill_fields()` to read field data from the Avada submissions database table. But that function is failing to parse the data format your Avada installation uses, so it sends `fields: []`. The entries exist (with timestamps and source), but the actual form values are empty.

---

## The Fix — Two Changes

### 1. Make "Sync Entries" also re-enrich entries that have empty fields

**Where**: `trigger-site-sync/index.ts`

After the normal sync completes, check if any Avada leads exist with zero `lead_fields_flat` records. If so, automatically trigger the `backfill-avada` route (even when leads already exist) so that it re-ingests the field data.

**Change the condition on line 426-429** from:
```
requiresAvadaReset || (avadaActiveLeadCount === 0 && avadaRawEventCount === 0)
```
to also include a check for leads with missing field data:
```
requiresAvadaReset || (avadaActiveLeadCount === 0 && avadaRawEventCount === 0) || avadaLeadsWithEmptyFields > 0
```

Add a query that counts Avada leads that have zero corresponding `lead_fields_flat` rows.

### 2. Fix the backfill field extraction to actually parse Avada's data

**Where**: `mission-metrics-wp-plugin/includes/class-forms.php` — `extract_avada_backfill_fields()`

The current parser tries `json_decode`, `unserialize`, and URL-decoding, but Avada's actual storage format is likely not matching any of those paths. We need to add a diagnostic step:

**Add a diagnostic REST endpoint** (`/actv-trkr/v1/avada-debug`) that returns one raw sample row from the Avada submissions table, including the exact column names and raw column values. This lets us see exactly what format the data is in, so we can write the correct parser.

Then update `extract_avada_backfill_fields()` to handle whatever format we discover.

### 3. Make `ingest-form` update empty fields on re-ingest

**Where**: `supabase/functions/ingest-form/index.ts`

Currently `ingest-form` skips duplicate entries (deduplication guard). When backfill sends an entry that already exists, nothing happens. Change it so that if an existing entry has zero `lead_fields_flat` rows, the incoming fields are inserted even though the lead itself already exists.

---

## Summary

| Step | File | What |
|------|------|------|
| 1 | `trigger-site-sync/index.ts` | Trigger backfill when leads exist but have empty fields |
| 2 | `class-forms.php` + new debug endpoint | Diagnose + fix the Avada field parser |
| 3 | `ingest-form/index.ts` | Allow field enrichment on existing leads |

