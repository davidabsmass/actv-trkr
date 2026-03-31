

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

---

## Form Entry Ingestion & Reconciliation Gateway (LOCKED)

This is the **permanent, canonical architecture** for how form entries flow from WordPress into the dashboard. No alternative paths exist or should be created.

### Architecture Overview

```
WordPress (Source of Truth)
    │
    ├─── Real-time Hook ──► ingest-form (Edge Function)
    │    (on each new submission)
    │
    └─── Periodic Sync ──► sync-entries (Edge Function)
         (heartbeat / manual trigger)
```

### Path 1: Real-Time Ingestion (`ingest-form`)

**Trigger**: WordPress plugin fires on every new form submission (server-side PHP hook + client-side JS capture).

**Flow**:
1. Plugin sends entry payload with `entry_id`, `fields`, `context`, `provider`
2. Edge function authenticates via API key → resolves org + site
3. Dual-path deduplication: JS capture yields to server-side hook if both arrive within 10s window
4. Upserts `lead_events_raw` by `(org_id, site_id, form_id, external_entry_id)`
5. Checks for existing lead by `external_entry_id` column (falls back to JSONB lookup for un-migrated rows)
6. If lead exists with 0 fields but new payload has fields → enriches (adds `lead_fields_flat` rows)
7. If lead doesn't exist → inserts new lead + `lead_fields_flat` rows
8. Fires notification (in-app + email) for new leads

**Key invariants**:
- One lead per `external_entry_id` per form — duplicates are auto-trashed
- `external_entry_id` is stored in both the dedicated column AND `data.external_entry_id` JSON
- Avada CSV blobs are parsed using field_types metadata or schema template from existing entries

### Path 2: Reconciliation Sync (`sync-entries`)

**Trigger**: WordPress plugin sends full active entry ID lists during heartbeat or manual "Sync Entries" action.

**Flow**:
1. Plugin discovers all forms and their active (non-trashed) WordPress entry IDs
2. Sends `{ domain, forms: [{ form_id, entry_ids, provider }] }` to `sync-entries`
3. Edge function builds authoritative set from WordPress IDs
4. For each form, fetches ALL leads (any status) and maps them to WordPress IDs
5. **Strict set reconciliation**:
   - Leads matching a WordPress active ID → kept active (best candidate by field count wins)
   - Leads NOT matching any WordPress active ID → trashed
   - Duplicate leads for same WordPress ID → only richest one survives, rest trashed
6. Post-sync invariant check: `app_active_count === wp_active_count` per form
7. Returns parity status + warnings for any mismatches

**Safety guards**:
- All-empty Avada payload → skip (don't mass-trash)
- Duplicate ID sets across Avada forms → skip (plugin bug detection)
- Full-trash with 0 restores for Avada → skip (discovery failure)
- Outdated plugin + Avada + 0 entries → restore all (graceful degradation)

### What MUST NOT Change
1. **No client-side deduplication** — if WordPress has duplicates, we show duplicates
2. **No timestamp-based matching** — only `external_entry_id` matching
3. **No content-based dedup** — matching is strictly by WordPress entry ID
4. **WordPress is always right** — sync trashes what WP says is gone, keeps what WP says exists
5. **`external_entry_id`** is the canonical join key between WP and dashboard

### Supported Providers
Gravity Forms, Avada/Fusion Forms, Contact Form 7, WPForms, Ninja Forms, Formidable Forms, Elementor Forms, Fluent Forms, HappyForms, WS Form, and universal DOM capture.

### Plugin Version Requirements
- v1.3.4+: basic entry ID sync
- v1.3.12+: Avada multi-table canonical ID resolution (`avada_db_*` format)
