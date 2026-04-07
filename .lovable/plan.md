

## Why Forms Are Still Stale — Two Remaining Issues

The daily-site-sync fix **did work** — all 7 sites now report "synced" status. But the logs reveal two problems that are preventing actual data from flowing in:

### Issue 1: Apyx Medical returns 403 from WordPress

The WordPress REST API on apyxmedical.com is rejecting all requests with `403 Unauthorized`. This means the API key stored in the plugin on that site no longer matches what the system is sending. This is a site-side configuration problem — the plugin may need its API key re-entered or the plugin may be deactivated/cached.

**This requires action on the WordPress side** (re-saving the API key in the plugin settings on apyxmedical.com). No code change can fix this.

### Issue 2: Backfill continuation calls fail with 401

For sites that *do* respond (like livesinthebalance.org), the sync successfully pulls entries but when a large form needs multiple batches, the continuation call back to `trigger-site-sync` fails with 401. This is because `scheduleEntryBackfillContinuation` passes the original `authHeader` (which is the anon key from the cron call), but the self-call doesn't include the `x-cron-secret` header, so the auth check rejects it.

**Fix**: Pass the `x-cron-secret` header in the continuation call when the original request was a cron call.

### Plan

**Step 1: Fix backfill continuation auth** (code change)
- In `supabase/functions/trigger-site-sync/index.ts`, update `scheduleEntryBackfillContinuation` to accept and forward the `x-cron-secret` header
- Thread the `isCronCall` flag and cron secret value through to the continuation call site (~790-810)
- This ensures multi-batch backfills complete fully for large forms

**Step 2: Re-run sync to verify**
- Deploy the updated function and trigger `daily-site-sync` to confirm continuation works
- Verify new leads appear for sites that respond (livesinthebalance.org, georgiaboneandjoint.org, etc.)

**Step 3: Apyx Medical — site-side fix needed**
- The Apyx WordPress site is returning 403 on all REST API endpoints
- Someone with WordPress admin access to apyxmedical.com needs to verify: (a) the plugin is active, (b) the API key in the plugin settings matches the key in the dashboard
- No dashboard code change can resolve this — it's the WordPress side blocking requests

### What this means for timing
- After Step 1 deploys: sites other than Apyx should start showing new entries within minutes
- Apyx specifically needs WordPress admin intervention first

### Files changed
- `supabase/functions/trigger-site-sync/index.ts` — forward cron-secret header in continuation calls (~5 lines changed)

