
## SSL & Domain Renewal Reliability Assessment

### Data Sources & Accuracy

**Domain Expiry (RDAP Protocol)**
- Source: `rdap.org` (Registry Data Access Protocol)
- Accuracy: **High** — directly queries domain registrar databases
- Limitation: RDAP coverage is global but some registrars may have delayed updates (typically <24hrs)
- Fallback: Returns `null` if lookup fails; no cached data used

**SSL Certificate Expiry (crt.sh)**
- Source: Certificate Transparency logs (public CT logs)
- Accuracy: **Very High** — CT logs are authoritative for all publicly-trusted certs
- Coverage: Works for any domain with a valid SSL cert issued by Let's Encrypt, DigiCert, etc.
- Limitation: Self-signed or private certs won't appear; crt.sh may lag 1-2 hours behind cert issuance

**Renewals Table**
- Source: Manual user input
- Accuracy: **Dependent on data entry** — only as reliable as the user's records
- No automated verification; users must keep dates updated

### Update Frequency & Latency
- Checks are **manually triggered** via the edge functions (not on a schedule)
- No automated cron job runs these checks; requires explicit invocation
- Last check timestamp stored in `domain_health.last_checked_at` and `ssl_health.last_checked_at`
- **Risk**: If checks aren't scheduled, data can become stale

### Limitations & Gaps
1. **No automatic scheduling**: Checks only run if explicitly called; there's no visible cron job
2. **Network timeouts**: 10s for RDAP, 15s for crt.sh; slow registrars may fail silently
3. **Renewal tracking**: Fully manual; no integration with registrar APIs
4. **Private/internal certs**: Won't be detected by crt.sh
5. **Grace periods**: System doesn't account for registrar/certificate grace periods
6. **Alert timing**: Alerts trigger at 60, 30, 14, 7 days — but only if checks run at that exact threshold

### Recommendation
The data is **accurate when fresh** but **not proactively maintained**. You should:
- Set up a scheduled edge function to run these checks daily/weekly
- Display "last checked" timestamps prominently so users know data freshness
- Consider adding a "Check Now" button for manual verification
- Document that renewal dates are user-maintained and require regular updates
