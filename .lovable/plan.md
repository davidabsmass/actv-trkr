## The problem

Visitor Journeys today already paginates 50 rows per page, but every page load:

1. Scans all `sessions` in the date range for the org
2. Joins `pageviews`, `leads`, `goal_completions`, and `events` for those sessions
3. Computes `COUNT(*)` over the full filtered set (so the cost grows with traffic, not page size)
4. Calls `calculate_engagement_score()` once per returned row (n+1 query)

At 100k–1M sessions/month per org this gets slow and expensive — and the row-by-row list itself stops being useful to humans. Nobody scrolls 10,000 sessions.

The fix is a mix of **hard limits**, **smart sampling**, and **moving aggregates server-side** so the page stays fast and useful no matter how big the org grows.

---

## Plan

### 1. Cap the live list at 500 sessions, surface the rest via filters and CSV

The interactive list is for spot-checking and investigation, not browsing.

- Hard ceiling of **500 sessions** returned by `get_session_journeys` regardless of date range.
- When the underlying filtered set exceeds 500, show a banner: "Showing the 500 most recent sessions matching your filters. Narrow the date range or filter to see more — or export to CSV for the full set."
- Add a **"Most relevant first"** default sort (leads + conversions first, then engaged, then bounced) so the cap shows the most useful 500, not just the newest 500.
- Add a **CSV export** that streams the full filtered set via an edge function (writes directly to a download), bypassing the UI cap. Reuses existing export-audit logging.

### 2. Replace `COUNT(*)` with a cheap estimate above a threshold

Counting every matching session on every page change is the single most expensive part of the RPC.

- Below ~5,000 sessions in range: keep exact count (cheap, useful).
- Above that: return `total_count = NULL` and show "500+ sessions" instead of "12,438 sessions". Aggregate stats (totals, conversion rate, channel breakdown) already live in the stat cards above — they're the right place for "how many" questions.

### 3. Make engagement score a column, not a function call per row

`calculate_engagement_score()` runs once per row today. We'll persist it.

- Add `engagement_score smallint` column to `sessions`.
- Backfill existing rows in batches.
- Update the session ingestion / session-close path to write the score when the session ends (or recompute on a 5-minute cron for active sessions).
- RPC reads the column directly — removes the per-row function call entirely.

### 4. Add the indexes the RPC actually needs

Current scans likely fall back to seq scan once a date range is wide. Add:

- `sessions (org_id, started_at DESC)` — primary list ordering
- `sessions (org_id, site_id, started_at DESC)` — site-scoped views
- `pageviews (org_id, session_id, occurred_at DESC)` — exit-page lookup
- Partial index `sessions (org_id, started_at DESC) WHERE engagement_score IS NOT NULL` if we want fast "engaged only" filtering

### 5. Tier the page UI for high-volume orgs

When an org has > ~10k sessions/month:

- Default date range collapses to **last 7 days** (instead of 30) on this page only
- The list section gets a "High-volume mode" badge with a one-line note explaining the 500-row cap
- Aggregates and channel breakdown remain unchanged — they're already aggregate queries

### 6. Retention safety net (already partially in place)

Per the existing 60-day live / 12-month reporting policy: sessions older than 60 days are archived and not part of this list at all. Confirm the journey RPC respects that boundary, and that the CSV export for older windows routes through the Archives flow instead.

---

## Technical details

**Database changes (one migration):**
- `ALTER TABLE sessions ADD COLUMN engagement_score smallint;`
- Backfill in batches of 10k via a one-shot script or paginated UPDATE
- Trigger on `session_close` or 5-min cron to keep it fresh
- New indexes listed above
- Updated `get_session_journeys` RPC:
  - Hard `LIMIT 500` on the `filtered` CTE before `CROSS JOIN counted`
  - Conditional count: `CASE WHEN (SELECT COUNT(*) FROM base_sessions) > 5000 THEN NULL ELSE (SELECT COUNT(*) FROM filtered) END`
  - Read `s.engagement_score` directly instead of calling the function
  - New `p_sort` param: `'relevance' | 'recent'`

**Edge function:**
- New `export-visitor-journeys` function — streams CSV using same auth + filters as RPC, no row cap, logs to `export_audit`

**Frontend:**
- `VisitorJourneysList.tsx`: handle `total = null` case ("500+ sessions"), add cap banner, add "Export CSV" button, default sort dropdown
- `VisitorJourneys.tsx`: detect high-volume org and adjust default date range

**Files touched:**
- New migration under `supabase/migrations/`
- New edge function `supabase/functions/export-visitor-journeys/`
- `src/components/journeys/VisitorJourneysList.tsx`
- `src/pages/VisitorJourneys.tsx`

---

## Out of scope (intentionally)

- No materialized view yet — we can add one later if even the capped query gets slow
- No background pre-aggregation of journey rows — current shape is fine once engagement_score is persisted and the count is bounded
- No change to `TopConvertingSources`, `ChannelBreakdown`, or `VisitorJourneyStats` — those are already aggregate queries that scale fine
