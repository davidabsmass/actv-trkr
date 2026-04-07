

## Fix Daily Sync — Two Breaks in the Chain

### Problem Summary
Forms stopped coming in because the daily automated sync is broken at two points:

1. **Missing cron secret in database** — The cron job uses `call_edge_function()` which reads `cron_secret` from `app_config`. That row doesn't exist, so an empty string is sent. The `daily-site-sync` function compares it against the `CRON_SECRET` environment variable and rejects with 401.

2. **Auth mismatch on trigger-site-sync** — Even if the first issue is fixed, `daily-site-sync` calls `trigger-site-sync` with the anon key as a Bearer token. But `trigger-site-sync` requires a real user JWT (it calls `auth.getUser()`), so it also rejects with 401.

### Fix Plan

**Step 1: Add cron-secret bypass to `trigger-site-sync`**
- File: `supabase/functions/trigger-site-sync/index.ts`
- Before the `auth.getUser()` check (line 445), add logic to detect the `x-cron-secret` header
- If the header matches the `CRON_SECRET` env var, skip user authentication and org membership checks
- Still require a valid `site_id` and perform all the same sync logic
- This is the same pattern used by `daily-digest`, `nightly-summary`, etc.

**Step 2: Insert `cron_secret` into `app_config`**
- Use SQL insert to populate `app_config` with key `cron_secret` set to the value of the `CRON_SECRET` environment variable
- This allows `call_edge_function()` to pass the correct secret in headers

**Step 3: Verify the fix**
- Use the edge function testing tool to call `daily-site-sync` and confirm it completes successfully

### What changes
- `supabase/functions/trigger-site-sync/index.ts` — add cron-secret auth bypass (~15 lines)
- `app_config` table — insert one row

### What does NOT change
- No WordPress plugin changes
- No changes to existing sync/reconciliation logic
- No changes to how manual (user-initiated) syncs work
- No data deletions or modifications

