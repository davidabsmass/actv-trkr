

## Daily Site Sync — Implementation Plan

### Confirmation: Zero Risk to Existing Data

As established in the previous discussion, this implementation carries no risk:
- Uses the exact same read-only `scan_all_forms()` code path already running on manual syncs
- Forms are only added/updated, never deleted
- Entry reconciliation has the existing safety guard (skips trashing if counts drop suspiciously for large forms)
- No writes to WordPress — dashboard-side only

### Steps

**1. Create Edge Function `daily-site-sync`**
- File: `supabase/functions/daily-site-sync/index.ts`
- Authenticates via `x-cron-secret` header (same as `nightly-summary`, `daily-digest`)
- Queries all sites with a non-null `plugin_version` and an active (non-revoked) API key
- For each site, calls `trigger-site-sync` internally (reuses existing sync logic rather than calling WordPress directly — this handles all the backfill, safety guards, and error handling already built)
- Logs per-site results, returns summary JSON

**2. Add to `supabase/config.toml`**
- Add `[functions.daily-site-sync]` with `verify_jwt = false`

**3. Schedule pg_cron job**
- Use the insert tool (not migration) to add a `cron.schedule` entry
- Runs once daily at 06:00 UTC
- Calls the edge function via `net.http_post` with the cron secret header
- Same pattern used by existing `nightly-summary` and `daily-digest` crons

### Architecture

```text
pg_cron (06:00 UTC daily)
  └─► POST /functions/v1/daily-site-sync
        ├─ Auth: x-cron-secret
        ├─ Query: all sites with plugin + active API key
        └─ For each site:
             └─► POST /functions/v1/trigger-site-sync
                   ├─ Scans forms (read-only)
                   ├─ Reconciles entries (with safety guards)
                   └─ Updates domain/SSL health
```

### What syncs daily
- Form discovery (new forms detected, names updated)
- Entry reconciliation (new entries pulled in, deleted entries soft-trashed with safety guards)
- Domain/SSL health check
- Plugin version reporting

### Files touched
1. **New**: `supabase/functions/daily-site-sync/index.ts`
2. **Edit**: `supabase/config.toml` (add function config)
3. **Insert**: pg_cron schedule via SQL insert

