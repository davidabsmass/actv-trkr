# Restore Pageview Tracking After Instance Upgrade

## Current State

The Lovable Cloud instance upgrade restored most services. However, two issues remain:

1. **No pageviews recorded since 09:27 UTC** (~45 min gap). The `track-pageview` function is failing with a mix of `401 Invalid API key` and `504 timeout` responses.
2. **`track-event` is rejecting ~44% of incoming events** with `401 Invalid API key`, and `ingest-heartbeat` is rejecting ~62%.
3. Form ingestion (`ingest-form`) is fully healthy (100% success), proving the database itself has recovered.

The 401s are an authentication issue, not a capacity issue. The 504s on `track-pageview` only suggest a slow database path specific to that function (likely an insert into the `pageviews` table while it processes a backlog).

## Investigation Steps

1. **Read the three failing edge functions** (`track-pageview`, `track-event`, `ingest-heartbeat`) to confirm they share the same API key validation code path (centralized via `mem://security/ingestion-hardening`).
2. **Inspect recent function logs** for the exact 401 reason (key not found, hash mismatch, rate-limit, replay protection, expired key) — pull a sample from `edge_function_logs`.
3. **Check the `api_keys` table** for any keys recently disabled/rotated, and confirm the WordPress sites that are 401-ing are still mapped to active keys.
4. **Check `pageviews` table state** — recent insert latency, presence of any blocking triggers, index health, and whether the table is being held by long-running queries.
5. **Check Postgres logs** for slow inserts on `pageviews` to confirm whether the 504 is database-side or function-side.

## Likely Fixes

Depending on what the investigation finds, the fix will be one of:

- **Stale key cache**: clear the in-memory API key hash cache in the edge function (or restart the function) so newly-validated keys propagate.
- **Replay protection backlog**: during saturation, the replay-nonce store may have rejected legitimate retries from buffered WP queue. Loosen the replay window briefly to drain the WP retry queues.
- **`pageviews` insert path slow**: if a trigger or unindexed lookup is slowing inserts, add a missing index on `(site_id, occurred_at)` or batch-defer non-critical work (e.g., session updates) into an async path.
- **Specific keys actually invalid**: identify the affected sites and re-issue API keys, then notify the user which sites need the WP plugin reconfigured.

## Validation

After applying the fix:

1. Confirm `track-pageview` writes appear in `pageviews` within 60 seconds.
2. Re-query the last 5 minutes of edge logs and confirm 401/504 rates drop below 1% across all three ingestion endpoints.
3. Confirm livesinthebalance.org pageviews resume in the dashboard.

## Out of Scope (Suggested Follow-up)

After the immediate fix, consider these durability improvements as a separate task:
- Partition the `pageviews` table by month so saturation on recent data doesn't slow historical reads.
- Per-site ingestion rate limit so one busy site can't starve others.
- Monitoring alert when ingestion 4xx/5xx rate exceeds 5% for 5+ minutes.
