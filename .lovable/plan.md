

## SSL & Domain Renewal Reliability — Implemented

### What was done

1. **Cron jobs** scheduled via `pg_cron` + `pg_net`:
   - `check-domain-ssl` runs **twice daily** at 06:00 and 18:00 UTC
   - `check-uptime` runs **every 10 minutes**
   - `check-renewals` runs daily at 06:00 UTC

2. **Retry logic** added to `check-domain-ssl` edge function:
   - Up to 3 attempts with exponential backoff for RDAP and crt.sh lookups
   - 15-second timeout per request
   - Detailed console logging for debugging

3. **False downtime prevention**:
   - `down_after_minutes` increased from 15 → 30 (with 5-min heartbeat interval)
   - Cleaned up 11 false DOWNTIME incidents and related alerts

4. **"Check Now" button** on the Monitoring page triggers on-demand checks

### Extensions enabled
- `pg_cron` (scheduling)
- `pg_net` (HTTP calls from SQL)
