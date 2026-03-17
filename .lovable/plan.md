

## Plan: Avada Forms Reset & Reimport

### Root Cause
All Avada entries in the database use legacy `avada_TIMESTAMP_HASH` IDs. The plugin (v1.3.8) now sends `avada_db_X` IDs. These formats can never match. Timestamp fallback also fails because stored `submitted_at` values don't correspond. Every safety guard fires correctly, but sync is permanently deadlocked.

### Solution: Add a "Reset Avada Entries" edge function + UI button

**New edge function: `reset-avada-entries`**
- Authenticated via JWT (admin/member only)
- Accepts `{ org_id, site_id }` (or derives from user context)
- For each Avada form on that site:
  1. Delete all rows from `lead_fields_flat` where `lead_id` matches Avada leads
  2. Delete all rows from `lead_events_raw` for that form
  3. Delete all rows from `leads` for that form
- Returns count of deleted entries
- After reset, the next WordPress "Sync Forms" will re-discover forms, and new submissions will flow in with `avada_db_X` IDs that actually match

**UI: Add reset button to Forms page**
- In the Avada sync warning banner area (or per-form in FormDetail), add a "Reset Avada Entries" button
- Confirm dialog: "This will delete all existing Avada lead data and allow clean reimport. This cannot be undone."
- On success, invalidate queries and show toast

### Files to create/edit

| File | Change |
|------|--------|
| `supabase/functions/reset-avada-entries/index.ts` | New edge function: authenticate user, delete lead_fields_flat → lead_events_raw → leads for all Avada forms on the site |
| `src/pages/Forms.tsx` | Add "Reset Avada Entries" button with confirmation dialog near the sync warnings section; call the edge function; invalidate queries on success |

### Why not fix matching?
The legacy IDs contain no recoverable database ID — they're `timestamp_hash` values generated at submission time. There's no mapping from `avada_1773682987_592536638` → `avada_db_42`. A clean slate is the only reliable path forward.

### After reset
New Avada submissions will be ingested with `avada_db_X` IDs, and future sync-entries calls will match correctly since both sides use the same ID format.

