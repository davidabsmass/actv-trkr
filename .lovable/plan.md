## Why you're running out of space

Your Lovable Cloud database is **3.1 GB**, but your actual app data is only **~400 MB**. The other **~2.7 GB (87%)** is log bloat from background plumbing — not your real data:

| Source | Size | What it is |
|---|---|---|
| `cron.job_run_details` | **2.44 GB** | Every run of every scheduled job (heartbeats, syncs, summaries, cleanups) keeps a row forever. Many of your jobs run every minute, so this grows fast. |
| `net._http_response` | **251 MB** | Stored response body of every HTTP call your DB triggers/cron jobs make to Edge Functions via `pg_net`. |
| Public app data (pageviews, leads, sessions, etc.) | ~400 MB | Your actual product data — fine. |
| Auth, storage, system | <2 MB | Negligible. |

This is also the source of the **disk I/O warnings** and the recent **503s on edge functions** — the underlying instance is spending I/O on these log tables.

## What I'll do

### 1. One-time cleanup (immediate ~2.7 GB freed)
- Truncate `cron.job_run_details` keeping only the last 7 days (for debugging recent failures).
- Truncate `net._http_response` keeping only the last 24 hours.
- Run `VACUUM FULL` on both tables so the OS actually reclaims the disk space (not just marks it reusable).

### 2. Automatic retention going forward
Add two scheduled cron jobs that run nightly:
- **Purge cron history** older than 7 days from `cron.job_run_details`.
- **Purge net responses** older than 24 hours from `net._http_response`.

This keeps the bloat from ever returning.

### 3. Audit cron job frequency (optional, recommended)
Many jobs are scheduled at `* * * * *` (every minute). I'll list them and flag any that could safely run every 5–15 minutes instead, which would cut log growth 5–15×. You'll get a list to approve before any frequency changes are made.

### 4. Verify
After cleanup, re-check `pg_database_size` — should drop from 3.1 GB to roughly 400–500 MB.

## Technical details

```sql
-- Cleanup
DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';
DELETE FROM net._http_response   WHERE created   < now() - interval '24 hours';
VACUUM FULL cron.job_run_details;
VACUUM FULL net._http_response;

-- Retention jobs
SELECT cron.schedule('purge-cron-history', '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'$$);
SELECT cron.schedule('purge-net-responses', '15 3 * * *',
  $$DELETE FROM net._http_response WHERE created < now() - interval '24 hours'$$);
```

`VACUUM FULL` briefly locks those two system tables (seconds, not minutes, at this size) — no impact on your app tables.

## What this does NOT touch
- Your `pageviews`, `leads`, `sessions`, `events`, etc. — untouched.
- Your existing scheduled jobs — they keep running, just without keeping forever-logs.
- No app/UI changes.

After this, if you'd still like more headroom (or to stop seeing 503s under load entirely), the next lever is upgrading the Cloud instance size in **Backend → Advanced settings**, but you likely won't need to once 87% of the disk is freed.
