

## Fix: Today's dashboard data showing stale kpi_daily aggregates

### Problem
The dashboard trend chart uses the `kpi_daily` table, which is populated by a nightly cron job at midnight UTC. For "today," the aggregation ran at midnight and captured only the 2 pageviews that existed at that moment. The rest of today's traffic (currently 179 pageviews, 134 sessions) is not reflected in the chart.

The KPI totals at the top of the dashboard use real-time head-only counts and ARE correct. The discrepancy is only in the daily trend chart and any widget that reads from `kpi_daily`.

The user is seeing "615 visits on the 26th and 2 on the 27th" — this is actually March 27 showing 615 (correct, fully aggregated) and March 28 (today) showing 2 (stale midnight snapshot).

### Fix

**File: `src/hooks/use-realtime-dashboard.ts`**

After filling the daily map from `kpi_daily` rows, add a "today patch": for the current date (today in UTC), replace the `kpi_daily` values with real-time counts from the raw tables. This ensures today's bar in the trend chart always reflects live data.

```text
After line 157 (after kpiRows.forEach), add:

// Patch today's data with real-time counts from raw tables
const todayStr = fnsFormat(new Date(), "yyyy-MM-dd");
if (dailyMap[todayStr]) {
  const todayStart = `${todayStr}T00:00:00Z`;
  const todayEnd = `${todayStr}T23:59:59.999Z`;
  const [todayPv, todaySess, todayLeads] = await Promise.all([
    supabase.from("pageviews").select("*", { count: "exact", head: true })
      .eq("org_id", orgId).gte("occurred_at", todayStart).lte("occurred_at", todayEnd),
    supabase.from("sessions").select("*", { count: "exact", head: true })
      .eq("org_id", orgId).gte("started_at", todayStart).lte("started_at", todayEnd),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .eq("org_id", orgId).neq("status", "trashed")
      .gte("submitted_at", todayStart).lte("submitted_at", todayEnd),
  ]);
  dailyMap[todayStr] = {
    pageviews: todayPv.count || 0,
    sessions: todaySess.count || 0,
    leads: todayLeads.count || 0,
  };
}
```

This adds 3 lightweight head-only count queries only for today's date, ensuring the trend chart is always accurate for the current day while still using fast pre-aggregated data for all historical days.

### Files to change
1. `src/hooks/use-realtime-dashboard.ts` — patch today's dailyMap entry with real-time counts

