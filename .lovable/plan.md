## Why your numbers are doubled

Avada submissions get stored in our `leads` table under up to **three different `external_entry_id` formats** for the same underlying WP entry:

| Format | Source path |
|---|---|
| `219` | WP background sync (raw DB id) |
| `avada_db_219` | Discovery/backfill from `class-import-adapters.php` |
| `avada_1774876628_1955499498` | Legacy realtime tracker hash |

Because each format is a different string, our `(form_id, external_entry_id)` dedup never fires, and one real submission becomes 2–3 rows. That is exactly what produced 18 rows for "Physician Medical" when WP shows 9 entries, 94 vs 46 for "Renew You", etc. Gravity is unaffected because it only ever uses one ID format.

## What I will do

### 1. Confirm the pattern across all sites
Run a one-shot audit query that, for every Avada form across every site, groups leads by the **numeric tail** of `external_entry_id` (the part after the last `_`). Any group with >1 row is a confirmed duplicate set. Save the result to `/mnt/documents/avada_dupes_audit.csv` for your review before any deletes.

### 2. Add a deterministic dedup key column
Migration: add `external_entry_key text` to `leads`, generated from `external_entry_id` with these normalization rules:
- `avada_db_219` → `avada:219`
- `219` (when provider is avada) → `avada:219`
- `avada_<ts>_<rand>` (legacy hash) → kept as-is so it can be matched against the canonical form by `(form_id, submitted_at±2min)` in step 3
- Gravity / CF7 / WPForms → `<provider>:<external_entry_id>` (no behavior change)

### 3. Merge duplicates (keep the richest row)
For each duplicate set:
- Pick the **survivor** = the row with the most non-null fields in `data`, breaking ties by oldest `created_at` (so we preserve original attribution).
- Reassign any dependent rows (`lead_events`, `lead_activity`, etc. — I'll enumerate FK refs in the migration) to the survivor.
- Delete the losers.
- Legacy hash rows (`avada_<ts>_<rand>`) are matched to the canonical row by `(form_id, submitted_at within 2 minutes)`; unmatched legacy rows are left alone and flagged in the audit CSV for manual review.

### 4. Prevent recurrence
- Add `UNIQUE (form_id, external_entry_key)` partial index (where `external_entry_key IS NOT NULL`).
- Update both ingest paths (`ingest-form` edge function + `class-import-adapters.php` in the WP plugin) to write the **canonical** `external_entry_key` so future inserts collide and upsert instead of duplicating.
- Bump plugin to v1.21.4 via `scripts/plugin-artifacts.mjs` (per the Plugin Deploy Rule).

### 5. Reconcile counters and verify
- Recompute `form_integrations.total_entries_imported` from the deduped `leads` count.
- Re-run the apyxmedical comparison and confirm:
  - Physician Medical: 9 = 9
  - Patient Medical: 6 = 6
  - Patient General: 22 = 22
  - Physician General: 28 = 28
  - Book In-Office: 13 = 13
  - Renew You, Near You: 46 = 46
  - Find a Licensed Provider Near You: still 173/224 (separate Gravity gap — addressed below)

### 6. Recover the 51 missing Gravity entries
The "Find a Licensed Provider" import job has been failing in batches of 30/40 because some entries throw on ingest. After the dedup migration is in place (so re-imports won't duplicate), I'll re-trigger a clean WP backfill for that one form and inspect the `last_error` on whichever entries still fail.

## Safety

- All deletes are wrapped in a transaction and gated on the audit CSV showing zero unexpected categories.
- WordPress is **not** modified — we only clean our own `leads` table (per Read-Only WP Principle).
- I'll save a backup table `leads_predupe_backup_2026_04_29` containing every row that gets deleted, kept for 30 days, so any deletion is reversible.

## Files I expect to touch

- New migration: dedup key column, backfill, unique index, FK reassignment
- `supabase/functions/ingest-form/index.ts` — emit canonical `external_entry_key`
- `mission-metrics-wp-plugin/includes/class-import-adapters.php` — emit canonical id
- Plugin version bump (4 files via `scripts/plugin-artifacts.mjs`)
- New memory: `mem://features/forms/avada-dedup-key` documenting the canonical key format

## What I will not touch

- Gravity / CF7 / WPForms ingest behavior (no duplication problem there)
- The `forms` and `form_integrations` schemas
- Any WordPress data
