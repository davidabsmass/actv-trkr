
You’re right to be frustrated. Here’s the exact plan and why this kept missing.

## What actually went wrong (root cause)
1. **We were fixing the wrong plugin source.**
   - Recent fixes were made in `mission-metrics-wp-plugin/*` (MM_* code).
   - But users download/install from `supabase/functions/serve-plugin-zip/index.ts`, which ships a **different inlined AT_* plugin**.
   - So fixes didn’t consistently reach your live WordPress plugin.

2. **Your Avada DB shape is not being handled by the distributed plugin.**
   - Live debug confirms:
     - Avada submissions table rows have `data = null`
     - Actual field values are in `wp_fusion_form_entries` (`value` column)
     - `avada-debug` returned `parser_output: []` (no extracted fields)
   - So ingestion receives `fields: []`, and UI can only show Date/Source.

3. **This is why first attempts looked better, then worse.**
   - Older events had partial legacy payloads.
   - New sync/backfills are writing canonical Avada IDs but with empty fields, so usable field data never populates.

---

## Execution plan (in order)

### Phase 1 — Immediate hotfix to stop the bleed
1. Patch `serve-plugin-zip` plugin payload (the actual shipped plugin), not just `mission-metrics-wp-plugin`.
2. In shipped Avada backfill logic:
   - Add/keep `fusion_form_entries` as a first-class secondary source.
   - Parse `value` + JSON `data` fallback per row.
   - Map labels/types safely when labels are absent.
3. Bump distributed plugin version (new release), and bump `plugin-update-check` latest version/changelog so WordPress update flow serves the fix.
4. Validate with `avada-debug-proxy`:
   - `parser_output` must be non-empty on your current sample rows.

### Phase 2 — Recover all missing fields already in your app
5. Run one full Sync Entries after plugin update.
6. Ensure ingestion enriches existing leads with empty `lead_fields_flat` rows (same external IDs, field data added in place).
7. Add a one-time recovery pass (if needed) to rehydrate Avada leads still missing fields after sync.

### Phase 3 — Prevent this from happening again
8. Remove source-of-truth drift:
   - Make plugin ZIP generation use one canonical plugin source (or hard fail build if shipped AT_* code diverges from MM_* fixes).
9. Add release guardrails:
   - Build assertions for Avada extraction markers (`fusion_form_entries` support, parser function presence, backfill route integrity).
10. Add post-sync telemetry:
   - Log “Avada leads enriched / still empty” counts so regressions are visible immediately.

---

## Acceptance checks (must pass)
- **Count integrity:** “Book In-Office” remains at 11 active entries.
- **Field integrity:** Avada leads show populated columns beyond Date/Source in Entries view.
- **Data integrity:** `lead_fields_flat` coverage for active Avada leads rises from ~0% to expected high coverage.
- **Debug integrity:** `avada-debug` shows non-empty parser output from current rows.
- **Export integrity:** CSV/XLSX exports include recovered Avada fields.

---

## Technical details
- Primary files to update:
  - `supabase/functions/serve-plugin-zip/index.ts`
  - `supabase/functions/plugin-update-check/index.ts`
  - (if needed for recovery visibility) `supabase/functions/ingest-form/index.ts`
- Runtime evidence already verified:
  - Avada forms currently have correct counts but missing field rows.
  - Recent backfill payloads contain `fields: []`.
  - Live WordPress debug exposes `wp_fusion_form_entries` values while parser returns empty.
