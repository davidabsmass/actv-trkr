

## SSL & Domain Renewal Reliability — Implemented

### What was done

1. **Daily cron jobs** scheduled via `pg_cron` + `pg_net`:
   - `check-domain-ssl` runs daily at 06:00 UTC
   - `check-renewals` runs daily at 06:00 UTC
   - Both invoke the corresponding edge functions automatically

2. **"Check Now" button** added to the Domain & SSL tab on the Monitoring page:
   - Triggers `check-domain-ssl` edge function on demand
   - Shows spinner during check, invalidates cached data on completion

3. **Last checked timestamps** were already displayed — updated empty-state text to guide users to click "Check Now"

### Extensions enabled
- `pg_cron` (scheduling)
- `pg_net` (HTTP calls from SQL)
