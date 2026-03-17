
Root cause confirmed from runtime logs and data:

1) Your “Sync Entries” is running, but Avada is hitting a safety lock.
- Logs show repeated: `full_trash_pattern=true (...) -> skipping destructive sync`.
- That means the system detects “this would trash everything” and refuses to do it to protect data.

2) Why old entries remain visible:
- Those rows are legacy Avada IDs (`avada_...`) that don’t match current IDs (`avada_db_...`).
- Sync only reconciles active/deleted status; it does not fully rebuild historical entries.
- So without a reset/backfill path, the deadlock keeps those legacy rows in place.

3) Current backend state I verified:
- Avada reset endpoint executed successfully once and removed 46 Avada leads.
- Database now shows 0 Avada leads and 0 Avada raw events.
- If you still see old rows in UI, that is stale client cache (refresh/reopen Forms will clear it).

Implementation plan (to make this never happen again):

Phase 1 — Hard-stop deadlock UX (fast)
- Files: `supabase/functions/sync-entries/index.ts`, `supabase/functions/trigger-site-sync/index.ts`, `src/pages/Forms.tsx`
- Add explicit machine-readable flags in sync responses:
  - `requires_avada_reset: true`
  - `blocked_reason: "legacy_id_deadlock"`
- In Forms UI:
  - Disable/replace generic “Sync Entries” action when this flag is present.
  - Show a persistent “Reset required” state with one clear CTA.
  - After reset, auto-refetch all form/lead queries immediately.

Phase 2 — Make reset robust and transparent
- File: `supabase/functions/reset-avada-entries/index.ts`
- Add strict deletion error handling (fail loudly if any child delete fails).
- Add pagination for large datasets (avoid partial cleanup past default query limits).
- Return structured result:
  - `deleted_leads`, `deleted_raw_events`, `deleted_flat_fields`, `forms_affected`.
- Surface those counts in UI toast so user knows exactly what happened.

Phase 3 — Add true reimport system (recommended)
- Files: `mission-metrics-wp-plugin/includes/class-forms.php`, new backend ingest function
- Build a historical Avada backfill endpoint in the plugin:
  - send full entries + stable `avada_db_*` IDs + timestamps/fields.
- Add backend upsert path to rebuild leads/fields from that payload.
- This gives a real “forget + reimport” flow (instead of reset-only).

Technical acceptance criteria
- No more silent deadlock loops.
- When mismatch is detected, user sees one required action, not repeated failed syncs.
- Reset reports exact deleted totals and immediately updates UI.
- Optional backfill path can reconstruct history reliably from WordPress source.

Immediate next check
- Open Forms and hard refresh once. If old entries still appear after refresh, I’ll trace the exact query result path and pin where stale data is being cached in the UI.
