

## Problem

The `check-domain-ssl` edge function **always upserts** SSL and domain health data, even when the external lookups (crt.sh, rdap.org) fail and return nulls. This means a single failed cron run wipes out previously good data, causing the UI to show "Unknown."

I just triggered a manual run and the data is back (apyxmedical.com SSL expires 2026-09-07, newuniformdesign.com SSL expires 2026-05-28). But the next cron run could wipe it again if crt.sh is temporarily unavailable.

## Fix

In `supabase/functions/check-domain-ssl/index.ts`, add guard clauses so the upsert only runs when valid data was returned:

1. **SSL health upsert** — only write if `sslResult.expiry` is not null
2. **Domain health upsert** — only write if `domainResult.expiry` is not null
3. **Always update `last_checked_at`** — even on failure, update the timestamp so we know the check ran, but don't overwrite the expiry/issuer fields with nulls

Concretely: split each upsert into two paths:
- **Success path**: upsert all fields as today
- **Failure path**: only update `last_checked_at` on the existing row (no insert if row doesn't exist yet)

This is a ~15-line change in the edge function's main loop. No database migration needed.

