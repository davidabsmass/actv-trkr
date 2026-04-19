

## What's Actually Happening (the facts)

The discovery pipeline is **100% working** — entry counts in `form_integrations` match WP exactly:

| Form | WP says | Our DB says | Imported |
|---|---:|---:|---:|
| #1 BBB Contact (spam-bombed) | 755,812 | 755,812 | 0 (skipped — `needs_review`) |
| #43 Andrea-Honigsfeld | 1 | 1 | ✅ 1 |
| #44 Level Up June 16 | 25 | 25 | ✅ 25 |
| #46 Leading for Excellence | 6 | 6 | ✅ 6 |
| #47 Reading Comprehension | 4 | 4 | ⏳ pending |
| #48 Choosing HQ Decodables | 1 | 1 | ⏳ pending |
| #49 Science of Reading | 5 | 5 | ⏳ pending |
| #50 Behind the Desk | 14 | 14 | ⏳ pending |
| #51 United for Language | 85 | 85 | ⏳ pending |
| #52, #53, #54 | match | match | ⏳ pending |

**3 forms fully imported. 10 forms sit in `pending` with `next_run_at` already in the past (10:39 UTC), but the queue worker has never executed them.**

## Root Cause

`process-import-queue` cron is configured (`*/2 * * * *`) but **has zero logs**, meaning either it's silently 401'ing on the cron secret or `pg_cron` isn't firing the HTTP call. Discovery tried to trigger it inline (`triggerQueueProcessor()`) and that also produced no logs — most likely the same auth path. The discovery itself is solid; what's broken is **job execution**.

Secondary issue: the BBB form #1 with 755k entries was correctly auto-quarantined as `needs_review`, but the UI shows it the same as healthy forms with "0 leads" — which feels like a failure even though it's by design.

## The Plan — Make It Bulletproof for Every Subscriber

### Phase 1 — Fix the executor (today, unblocks bbbedu)
1. **Diagnose the cron silence.** Verify `app_config.cron_secret` matches `CRON_SECRET` env. Add a one-time `net.http_post` test from SQL and inspect the response. Patch whichever is mismatched.
2. **Make `triggerQueueProcessor` synchronous & inline-process.** Discovery already creates jobs; have it process the first 1-2 batches *in the same request* (not just kick the cron) so users see progress immediately.
3. **Add a manual "Run queue now" admin button** + an unauthenticated keep-alive ping so we never depend on a single cron path.
4. **Drain the bbbedu backlog** by invoking `process-import-queue` directly with the cron secret to import the 138 sitting entries.

### Phase 2 — Universal builder coverage (this week)
The plugin already ships adapters for **Gravity, Avada/Fusion, WPForms, CF7** (`class-import-adapters.php`). Ninja Forms and Fluent Forms are referenced for live submissions but **have no import adapter**. Add:
- `MM_Adapter_Ninja` — uses `Ninja_Forms()->form()->get_subs()`
- `MM_Adapter_Fluent` — uses `wpFluent()->table('fluentform_submissions')`
- Register both in `MM_Adapter_Registry::init()`

### Phase 3 — Self-healing & observability (this week)
1. **Per-form health record** in `form_integrations`: WP count vs imported count, last attempt, stuck-since timestamp.
2. **`needs_review` UI treatment**: forms over 50k entries show a yellow "Spam-bombed — manual review" badge with a "Force import anyway" action, instead of looking identical to a 0-lead healthy form.
3. **Watchdog edge function** (`form-import-watchdog`) on a 10-min cron that:
   - Compares WP-reported entry count vs `total_entries_imported` for every active integration across every site.
   - Auto-creates a job for any gap > 0 with no active job.
   - Surfaces sites with stuck jobs (>30 min in `pending` and no signal) into a new admin "Import Health" panel at `/admin-setup`.
4. **Discovery on every site connect** — first plugin signal automatically calls `manage-import-job?action=discover`, so new subscribers never have to click anything.

### Phase 4 — The Book (App Bible)
Add a **"Form Import Pipeline"** section documenting:
- Supported builders, discovery contract, junk threshold, watchdog behavior, failure escalation.
- Mark for sign-off in `/admin-setup → App Bible`.

## Files to Change

```
supabase/functions/manage-import-job/index.ts          # inline-process after discover
supabase/functions/process-import-queue/index.ts       # log secret-check failure explicitly
supabase/functions/form-import-watchdog/index.ts       # NEW
supabase/migrations/<ts>_import_watchdog_cron.sql      # NEW: schedule + secret repair
mission-metrics-wp-plugin/includes/class-import-adapters.php
  + supabase/functions/serve-plugin-zip/plugin-template/...   # add Ninja + Fluent adapters
src/pages/AdminSetup.tsx                               # Import Health panel
src/components/settings/FormImportPanel.tsx            # needs_review badge + force-import
docs/APP_BIBLE.md                                       # new "Form Import Pipeline" section
scripts/plugin-artifacts.mjs                           # version bump (per Plugin Version Sync rule)
```

## Acceptance Criteria

- bbbedu's 10 pending jobs drain to `completed` and the UI shows lead counts that match WP exactly (excluding spam form #1 which displays a clear "Manual review required" badge).
- A brand-new subscriber connecting any of the 6 builders has all historical entries imported automatically within 5 minutes of plugin signal — no manual action.
- Watchdog catches and repairs any drift on every site every 10 minutes; admin panel makes drift visible.
- Sign-off recorded in App Bible for the new section.

