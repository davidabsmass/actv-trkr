

## Strict Authoritative Lead Reconciliation (IMPLEMENTED)

### Problem (Solved)
The same WordPress submission existed under two IDs (`avada_*` legacy + `avada_db_*` canonical), causing inflated counts and blank rows. Timestamp heuristics for restore/trash decisions made this oscillate unpredictably.

### Solution (Deployed)
1. **Dedicated `external_entry_id` column on leads** — indexed, backfilled from JSON data
2. **Strict set-based sync** — WordPress active entry IDs are the ONLY authority; no timestamp heuristics
3. **Canonical-first ingestion** — `ingest-form` uses the new column for upsert/dedup
4. **Hardened plugin ID generation** — multi-table, multi-strategy canonical ID resolution for Avada
5. **Post-sync invariant check** — sync reports parity/mismatch per form, never silently wrong
6. **One-time data repair** — legacy duplicate leads trashed where canonical exists

### Definition of Done
- ✅ Entry counts match WordPress after sync
- ✅ No timestamp-based restore heuristics
- ✅ Legacy + canonical twins cannot both be active
- ✅ Sync reports parity status per form
- ✅ Existing data repaired
