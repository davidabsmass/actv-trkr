
You’re right to be angry — we’ve been oscillating because the system currently mixes two different identity models for Avada entries, then tries to “fix” mismatches with timestamp heuristics. That combination is what keeps reintroducing wrong counts.

## What is actually happening (verified)
- The same real WordPress submission can exist in two IDs:
  - legacy realtime ID: `avada_*`
  - canonical DB ID: `avada_db_*`
- For your forms, both IDs are present in backend raw events and leads.
- `sync-entries` currently has a timestamp-based restore path for Avada legacy IDs.  
  If a legacy row shares timestamp with an active canonical row, it gets restored too.
- Result: app count inflates (example pattern: WP active=13, raw known=21, restore path can reactivate too many), and blank/incomplete rows appear when weaker legacy payloads are active.

## Permanent fix plan (no more circle behavior)

### 1) Replace heuristic reconciliation with strict authoritative reconciliation
- Make WordPress active entry ID list the only authority.
- For Avada forms:
  - Restore only exact IDs returned by WordPress active set.
  - Trash everything not in that set.
  - Remove timestamp-based restore logic entirely for Avada.
- Add hard invariant check per form:
  - `final_active_count` must equal `wordpress_active_count`.
  - If not equal, return blocked/error state (never silently show wrong count as “success”).

### 2) Introduce canonical entry identity at database level
- Add dedicated `external_entry_id` column on leads (instead of relying on JSON lookup).
- Backfill existing rows from current JSON data.
- Add uniqueness/indexing so one active identity cannot fan out unpredictably.
- Use this column everywhere reconciliation/counting happens.

### 3) Make ingestion idempotent and canonical-first
- In `ingest-form`:
  - Upsert/update by canonical identity instead of blind inserts.
  - If canonical and legacy variants appear for same real entry, canonical wins deterministically.
- Keep enrichment logic for missing fields, but tied to canonical identity.

### 4) Harden plugin ID generation contract
- In WordPress plugin Avada handling:
  - Strengthen canonical ID resolution path (`avada_db_*`) before fallback.
  - Send explicit entry identity metadata so backend can classify canonical vs legacy cleanly.
- Keep fallback safe, but fallback entries must never override canonical rows.

### 5) One-time repair pass for existing polluted data
- Run a targeted backend repair for affected Avada forms:
  - Reconcile to latest WordPress active ID set.
  - Trash non-authoritative legacy rows.
  - Rehydrate missing field payloads for authoritative rows from raw event payload/backfill data.
- This corrects current wrong counts and blank-value remnants without deleting historical records.

### 6) Add non-negotiable sync observability + guardrails
- Log and persist per-form sync audit:
  - WordPress active count
  - app active before/after
  - restored/trashed totals
  - mismatch flag
- UI sync should show “verified” only when counts match exactly; otherwise explicit mismatch state.

## Why this will now work reliably
Because it removes the root instability:
- No timestamp heuristics for identity decisions.
- No dual-source guessing between legacy/canonical IDs.
- No silent success when counts disagree.
- Deterministic set reconciliation + hard invariants makes wrong counts impossible to “look successful.”

## Technical implementation scope
- `supabase/functions/sync-entries/index.ts`
  - Remove Avada timestamp fallback restore.
  - Implement strict set-based authoritative sync for Avada.
  - Add post-sync invariant enforcement + blocked response.
- `supabase/functions/ingest-form/index.ts`
  - Canonical-id upsert/idempotency path.
  - Identity-aware merge behavior.
- `mission-metrics-wp-plugin/includes/class-forms.php`
  - Harden Avada canonical ID detection and payload identity metadata.
- DB migration(s)
  - Add/index canonical `external_entry_id` on leads and backfill.
- Optional UX/status updates in forms entries view
  - Show verified mismatch state from sync response.

## Definition of done
1. For any form, displayed active entry count exactly equals WordPress active entries after sync.
2. No extra rows are restored from timestamp similarity.
3. Legacy + canonical twin rows cannot both remain active for one real submission.
4. If parity cannot be proven, sync reports blocked/mismatch (never silent green success).
5. Existing affected forms are repaired to authoritative counts.
