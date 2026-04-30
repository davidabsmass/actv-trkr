## Problem

Two parallel form tables are out of sync, causing "Find a Licensed Provider Near You" (and others) to look broken on the Forms page:

- **`forms`** — canonical table where ingested **leads** live (created by `ingest-form` / `ingest-gravity`)
- **`form_integrations`** — the import-wizard catalog the Forms UI reads from

For Apyx, the import wizard discovered Gravity forms on **Apr 23/29**, creating new `form_integrations` rows. The matching rows in `forms` already existed from **Mar 1**. Nothing links the two, so:

| Form | `form_integrations` shows | Real lead count in `forms` |
|---|---|---|
| Find a Licensed Provider | 397 imported / status synced (counter inflated, no lead linkage) | 228 leads (under old `forms` row) |
| Apyx Contact Page | 2,899 / "still importing" | 2,929 leads (stuck job retry_count=63) |
| Customer Feedback (v2) | 2 / 2 (only one that lined up) | 2 |
| Other 4 Gravity forms | 0 imported | 0 (no submissions yet — fine) |

Why "Find a Licensed Provider" appears missing: the dashboard joins through `form_integrations` → no leads linked → widget hides it / shows empty state. The 224 leads exist but are orphaned to a stale `forms.id`.

Why "Apyx Contact Page" is stuck: WP backfill is throttling (429s in logs). Job is auto-retrying (63 retries) but `total_processed` (2,899) already exceeds true unique entries because the same cursor is being re-played after partial failures. The `total_expected=4,208` is also likely the WP raw count before our dedup.

## Goal: Iron-clad Gravity Forms parity

Make `form_integrations` and `forms` a single source of truth, with self-healing reconciliation so this can never silently desync again.

## Plan

### 1. One-time data heal for Apyx (and any other org with the same drift)
- For every `form_integrations` row, find the matching `forms` row by `(site_id, provider, external_form_id)`.
- Re-point all existing `leads.form_id` from the legacy `forms.id` to a single canonical `forms.id` per integration (prefer the older one to preserve history, then update `form_integrations` to reference it).
- Recompute `form_integrations.total_entries_imported` from the actual `COUNT(leads)` after dedup — kill the inflated 397 → 224, etc.
- Mark "Find a Licensed Provider Near You" as `status='synced'` with correct count.

### 2. Structural link: add `form_integrations.form_id` FK
- Add nullable `form_id uuid references forms(id)` to `form_integrations`.
- Backfill it for every existing row.
- Update `manage-import-job` (`discover` action) to upsert into `forms` first, then store that `forms.id` on the integration row. From now on, every integration row has a guaranteed canonical `forms.id`.

### 3. Self-healing reconciler (already runs every 15 min)
- Extend the existing **forms reconciler cron** to also:
  - Recompute `total_entries_imported` from `SELECT count(*) FROM leads WHERE form_id = form_integrations.form_id` (truth = actual stored leads, not the cursor counter).
  - Auto-resolve "stuck importing" by flipping to `synced` when `total_processed >= total_expected` OR when `retry_count > 20` AND the lead count matches WP truth within 2%.

### 4. Fix the stuck "Apyx Contact Page" job
- Reset its job to `pending` with `retry_count=0`, `cursor=null`, drop `adaptive_batch_size` to 10 to dodge the WP rate limiter, and let it converge.
- After the next clean pass, reconciler will mark it synced.

### 5. UI guarantee on the Forms page
- Always show every Gravity form discovered on the WP site, even with 0 leads — currently it does, but verify "Find a Licensed Provider" reappears once linked.
- Show a clear "Syncing X / Y" badge driven by reconciler-truth, not job-cursor counter.

## Technical details

**Migration**
```sql
ALTER TABLE form_integrations ADD COLUMN form_id uuid REFERENCES forms(id);
CREATE INDEX ON form_integrations(form_id);

-- Backfill link
UPDATE form_integrations fi SET form_id = f.id
FROM forms f
WHERE f.site_id = fi.site_id
  AND f.provider = fi.builder_type
  AND f.external_form_id = fi.external_form_id;

-- Heal counters from leads truth
UPDATE form_integrations fi
SET total_entries_imported = COALESCE(c.n, 0),
    status = CASE WHEN COALESCE(c.n,0) >= COALESCE(total_entries_estimated,0)
                  THEN 'synced' ELSE status END,
    last_synced_at = COALESCE(last_synced_at, now())
FROM (SELECT form_id, count(*) n FROM leads GROUP BY form_id) c
WHERE c.form_id = fi.form_id;

-- Unstick Apyx Contact Page job
UPDATE form_import_jobs
SET status='pending', retry_count=0, cursor=NULL, adaptive_batch_size=10,
    next_run_at=now(), last_error=NULL
WHERE id='252708e5-4ed5-4017-b187-d3b5e6e8f72f';
```

**Edge function changes**
- `manage-import-job/index.ts` `discoverForms()`: after upserting `form_integrations`, also upsert into `forms` and set `form_integrations.form_id`.
- `process-import-batch` (line 466 area): set counter from `count(leads)` not from cursor totalProcessed.
- Reconciler cron (`forms-reconciler` or equivalent): add the count-recompute + stuck-job auto-heal.

**Memory updates**
- Update `mem://features/forms/two-table-model` to record the new FK + reconciler invariant: "`form_integrations.form_id` is the source of truth; counters are recomputed from `leads`, never trusted from cursor state."

## Outcome

- "Find a Licensed Provider Near You" reappears with 224 leads, status synced.
- "Apyx Contact Page" finishes its sync and stops looking stuck.
- Future Gravity Forms automatically link on discovery — no more orphaned legacy `forms` rows.
- Reconciler converges any drift within 15 minutes, system-wide.
