

# Fix: Avada Backfill Missing 8 Entries

## Root Cause

The form count shows 38 instead of 46 because of a **table-search asymmetry** between two different code paths in the WP plugin:

1. **`get_active_entry_ids`** (called during sync-entries reconciliation): Searches ALL Avada submission tables (`fusion_form_submissions`, `fusion_form_db_entries`, `fusion_form_submission_data`, etc.) and **merges results** across all of them. This correctly finds **46 entries**.

2. **`process_entry_backfill_job`** (called during backfill): Stops at the **first table** that has matching rows. It only queries ONE table with the resolved form_id. This finds only **38 entries**.

The 8 missing entries live in a **different Avada table** than the 38 that were imported. The backfill never looks there.

The `sync-entries` function detects the mismatch (`wp=46 app=38`) but it can only trash/restore — it cannot CREATE new leads. The backfill is supposed to create them, but it misses 8 because it doesn't search all tables.

## Fix

### 1. Update `process_entry_backfill_job` Avada handler

In `mission-metrics-wp-plugin/includes/class-forms.php`, rewrite the Avada branch of `process_entry_backfill_job` to mirror the multi-table search used by `get_active_entry_ids`:

- Instead of stopping at the first `$primary_table`, iterate ALL existing Avada tables
- Use the same resolution layers (resolved internal ID, form ref columns, source_url matching)
- Merge and deduplicate rows across tables before building payloads
- Apply offset/pagination across the merged result set

### 2. Sync plugin template

Copy the updated `class-forms.php` to `supabase/functions/serve-plugin-zip/plugin-template/includes/class-forms.php`.

### 3. Version bump to 1.9.11

Update all 4 version files atomically via `scripts/plugin-artifacts.mjs`:
- `mission-metrics-wp-plugin/mission-metrics.php`
- `supabase/functions/serve-plugin-zip/plugin-template/mission-metrics.php`
- `src/generated/plugin-manifest.ts`
- `supabase/functions/plugin-update-check/index.ts`

### 4. Deploy

- Run `node scripts/plugin-artifacts.mjs` to rebuild the ZIP
- Deploy `serve-plugin-zip` and `plugin-update-check` edge functions

## Technical Details

The key change is in `process_entry_backfill_job` around lines 2616-2781. The current code uses a single-table search:

```text
Current flow:
  foreach ($existing_tables as $table)
    if table has entries → set $primary_table, break
  query ONLY $primary_table

Fixed flow:
  foreach ($existing_tables as $table)
    query each table with same resolution logic
    merge all rows, deduplicate by entry DB id
  paginate across merged set
```

This mirrors what `get_active_entry_ids` already does (lines 598-714), ensuring both paths find the same entries.

