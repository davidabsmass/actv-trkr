## The problem (confirmed in your data)

You have **4,843 total leads** but only **82 of them are attached to a tracked session**. The other 4,761 came in via:

- WordPress form imports during install/backfill (before tracking was active)
- Form submissions on pages where the tracker isn't loaded
- Adblocked / consent-declined visitors
- Server-to-server submissions (API, Zapier)

CVR currently divides **all** of these by sessions, so any site with import history will always be at 100%+ (capped). The number is meaningless.

## The fix

Change every conversion rate calculation to use the **same denominator and numerator universe** — only leads that were observed by our tracker.

**New rule:** A lead counts toward CVR only if `leads.session_id IS NOT NULL`. These are the leads where we actually witnessed the visitor's journey, so dividing by `sessions` is apples-to-apples.

```
       Tracked Leads (have session_id)
CVR = ─────────────────────────────────
            Tracked Sessions
```

Everything else (imports, sessionless POSTs) stays visible in lead lists, exports, and totals — they're real leads — but they don't pollute the conversion rate.

## What changes

### 1. Form CVR & Goal CVR (`src/hooks/use-goals.ts`)
- `formLeads` query gains `.not("session_id", "is", null)` so only tracked leads count
- Same filter applied to form-submission goal counts
- Cap can be removed (or kept as a safety net) since the math now balances naturally

### 2. Daily aggregation (`supabase/functions/aggregate-daily/index.ts`)
- The nightly `conversion_rate` kpi_daily rollup gets the same `session_id IS NOT NULL` filter on its lead count
- Backfills historical days with the corrected number so trends are consistent

### 3. Dashboard widgets that show CVR
- `ConversionBreakdown`, `WeekOverWeekStrip`, `TrendsChart`, `VisitorJourneyStats`, Performance page — all already read from `use-goals.ts` or `kpi_daily`, so they inherit the fix automatically

### 4. Tooltip/help copy
- Update the CVR tooltip on Dashboard + Performance to say:
  > "Conversion Rate = tracked leads ÷ tracked sessions. Imported leads and submissions from untracked pages are excluded so the rate reflects only activity our tracker actually observed."
- Add a small info note next to the Form CVR tile when there's a large gap between total leads and tracked leads (e.g. "4,761 leads not included — these came from imports or untracked pages")

### 5. Lead totals stay unchanged
- Total Leads, Leads by Source, Leads by Form, the Leads list, exports — all keep showing every lead. Only the **rate** metric is scoped.

## Expected outcome for your data

| Metric | Before | After |
|---|---|---|
| Total Leads (last 7d) | 25 | 25 (unchanged) |
| Tracked Leads (last 7d) | — | ~3–5 |
| Form CVR | 100.0% (capped from 550%) | ~5–8% (real number) |

You'll finally see CVR move when you actually improve conversion, instead of being pinned at 100%.

## Out of scope

- No schema changes, no data deletion, no migration. Pure calculation change.
- The historical 4,761 imported leads stay in the database and stay visible everywhere they're shown today.
- AI insights and reports already pull from the same hooks/aggregations, so they update automatically.
