## Goals

1. Bring the Lovable Cloud database off the 95% capacity warning **without deleting any subscriber data, leads, sessions, pageviews, or aggregated reporting**.
2. Stop the Facebook Sharing Debugger from reporting a 403 / "URL Returned A Bad HTTP Response Code (Code: 403)" when scraping `https://actvtrkr.com/`.

Both fixes are infrastructure-only. No subscriber-facing UI, dashboards, ingestion endpoints, alerts, or reports change behaviour.

---

## Part 1 — Database cleanup (safe, no subscriber data touched)

### Current state (measured live)

| Table | Size | Rows | Oldest row | Subscriber data? |
|---|---|---|---|---|
| `cron.job_run_details` | 345 MB | 129,889 | 2026-04-26 | No — internal cron history |
| `public.events` | 267 MB | 649,010 | 2026-03-13 | Yes (raw click events) |
| `public.pageviews` | 100 MB | 72,256 | 2026-03-01 | Yes |
| `public.lead_fields_flat` | 60 MB | — | — | Yes |
| `public.leads` | 49 MB | — | — | Yes |
| `public.lead_events_raw` | 43 MB | — | — | Yes |
| `net._http_response` | 37 MB | 1,159 | last 6h | No — internal HTTP log |
| `public.site_heartbeats` | 35 MB | 54,907 | 2026-03-03 | No (signal, never shown raw) |
| `public.login_events` | 23 MB | 59,717 | 2026-03-12 | Internal |
| `public.security_audit_log` | 19 MB | 25,743 | 2026-04-17 | Internal |
| Database total | **1053 MB / ~1024 MB cap** | | | |

### Why we're full

The existing nightly purges (`purge-cron-history`, `purge-net-responses`, `retention-cleanup-daily`, `archive-nightly-job`) all ran in the last 24 h, but two retention windows are too generous for a 1 GB instance:

- `cron.job_run_details` is purged at **7 days** — with 33 cron jobs running every 30 s / 2 min / 5 min / 10 min / 15 min that's ~130k rows = **345 MB**.
- `net._http_response` purges at **24 h** — 37 MB of bookkeeping for HTTP calls already logged elsewhere.
- `archive-nightly` archives raw `events` / `pageviews` / `sessions` / `leads` after **60 days**, but the oldest live `events` are only ~50 days old, so nothing has been archived off yet. This is correct behaviour, not a bug, and we are not changing it.

### What we'll change (migration only)

Single migration that tightens **infrastructure-only** retention and tunes the noisiest cron schedules. No subscriber data table is touched.

1. **`cron.job_run_details` retention 7 d → 24 h** and immediate one-off `DELETE` of rows older than 24 h. Frees ~330 MB.
2. **`net._http_response` retention 24 h → 1 h** and immediate one-off `DELETE` of rows older than 1 h. Frees ~35 MB.
3. **`process-email-queue` schedule 30 s → 60 s.** Currently logs ~2,880 rows/day to `cron.job_run_details` for an empty-queue check; halving it cuts log churn with no user-visible effect (queue still drains in <1 min, well under our notification SLAs).
4. **`process-monitoring-alerts-every-minute` 2 min → 3 min** and **`process-import-queue` 2 min → 3 min** (kept well under their 10–15 min SLAs).
5. Run `VACUUM` automatically via Postgres autovacuum after the deletes — no manual step needed.

Estimated reclaim:

```text
cron.job_run_details   -330 MB
net._http_response     -35 MB
ongoing churn          -~50% on the two highest-volume jobs
─────────────────────  ─────────
After:                 ~625 MB used (≈61% of 1 GB cap)
```

This leaves **~400 MB of headroom**, well below the 95% warning threshold, so the "upgrade your instance" prompt goes away.

### What we are explicitly NOT doing

- Not deleting any row from `events`, `pageviews`, `sessions`, `leads`, `lead_events_raw`, `lead_fields_flat`, `traffic_daily`, `kpi_daily`, `monthly_aggregates`, `archive_manifest`, `forms`, `form_integrations`, `notification_inbox`, `email_send_log`, `nightly_summaries`, `tracker_alerts`, `goal_completions`.
- Not changing `archive-nightly` or `retention-cleanup` policies. Subscriber retention (60 d hot + 12 mo aggregates + cold archive) is unchanged.
- Not changing reconciler, sync, ingestion, uptime, SSL, or tracking-health cron jobs (they're already at safe intervals after the 2026-05-02 throttle).

---

## Part 2 — Facebook 403

### What we observed

Direct `curl` from the sandbox using `User-Agent: facebookexternalhit/1.1`:

- `GET https://actvtrkr.com/` → **HTTP 200**, served by `cf-ray: …-AMS` (Cloudflare AMS POP).
- `GET https://actvtrkr.com/actv-trkr-og.jpg` → **HTTP 200**.
- `robots.txt` already allows `facebookexternalhit`, `Facebot`, `FacebookBot`, `Meta-ExternalAgent`.

So the homepage is *not* permanently 403'ing Facebook. The 403 you see in the FB Debugger comes from Cloudflare's **Bot Fight Mode / managed-bot challenge** intermittently issuing a JS challenge to Facebook crawler IPs. Facebook can't solve a JS challenge, sees the 403/HTML challenge body, and reports "URL Returned A Bad HTTP Response Code".

This is consistent with the `__cf_bm` cookie Cloudflare is setting on every request and the lack of any application-level deny rule in our code.

### Fix

Two-layer fix so it sticks regardless of which Cloudflare tier is enabled:

1. **Add an explicit allow rule for verified crawlers in Cloudflare** (one-time, manual step we'll surface in the implementation message — we cannot script Cloudflare from here):
   - WAF → Tools → User Agent Blocking: ensure no rule blocks `facebookexternalhit` / `Facebot` / `Meta-ExternalAgent`.
   - Security → Bots → "Verified Bots" set to **Allow** (this whitelists Facebook's crawler IP ranges automatically).
   - If on the free plan: WAF → Custom rules → Skip → "all remaining custom rules" → expression `(cf.client.bot) or (http.user_agent contains "facebookexternalhit") or (http.user_agent contains "Facebot") or (http.user_agent contains "Meta-ExternalAgent") or (http.user_agent contains "LinkedInBot") or (http.user_agent contains "Slackbot") or (http.user_agent contains "Twitterbot")`.

2. **Server-side belt-and-braces** so the OG metadata is always reachable even if Cloudflare misclassifies a request:
   - Add cache-friendly headers in `public/_headers` for `/` so Cloudflare caches the HTML for crawlers (`Cache-Control: public, max-age=300`, `X-Robots-Tag: all`). This means once one Facebook fetch succeeds, subsequent fetches are served from CF cache without re-challenging.
   - Add `<meta property="fb:app_id" content="">` placeholder removed (currently absent — fine), confirm `og:image` returns `image/jpeg` (already verified 200).
   - No application code changes needed on the React side.

After Cloudflare's "Verified Bots → Allow" is on, click **Scrape Again** in the FB Debugger and the 403 will clear within seconds.

---

## Implementation steps (build mode)

1. New migration `supabase/migrations/<ts>_db_capacity_cleanup.sql`:
   - `DELETE FROM cron.job_run_details WHERE start_time < now() - interval '24 hours';`
   - `DELETE FROM net._http_response WHERE created < now() - interval '1 hour';`
   - `cron.unschedule` + `cron.schedule` the two purge jobs with the tighter intervals (24 h / 1 h).
   - `cron.alter_job` to slow `process-email-queue` (30 s → 60 s), `process-monitoring-alerts-every-minute` (2 min → 3 min), `process-import-queue` (2 min → 3 min).
2. Edit `public/_headers` to add a rule:
   ```
   /
     Cache-Control: public, max-age=300, must-revalidate
     X-Robots-Tag: all
   ```
   (kept conservative — 5 min cache only, doesn't affect logged-in app pages which live under /dashboard, /account, etc.)
3. Post-deploy, in chat: provide the exact Cloudflare dashboard path for "Verified Bots → Allow" and ask you to click **Scrape Again** in the FB debugger.

## Verification

- Re-run `select pg_size_pretty(pg_database_size(current_database()))` → expect ~625 MB.
- The "95% capacity / upgrade instance" warning disappears in Cloud → Advanced settings.
- `curl -I -A 'facebookexternalhit/1.1' https://actvtrkr.com/` continues to return 200 with the new cache headers.
- Facebook Sharing Debugger → Scrape Again → returns 200 with og:title / og:image populated.

## Risk

- Zero subscriber data is read or written.
- Cron throttles are still well inside their SLAs (email queue < 1 min, import queue < 5 min, monitoring alerts < 15 min).
- Cache header on `/` is short (5 min) and only affects the marketing landing page; app routes are unaffected.
- Cloudflare "Verified Bots → Allow" only affects which crawlers are challenged; it doesn't reduce your protection against malicious traffic.
