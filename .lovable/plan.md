

## Default Reports KPI to 30-Day Comparison (Including Today)

### What Changes
One file: **`src/components/reports/OverviewTab.tsx`**

1. **Change default period** from `"7d"` to `"30d"` (line 288)
2. **No date-shifting needed** — keep including today as you requested

That's it. The current date logic already includes today and compares current vs prior period correctly. All three KPI boxes (Traffic, Leads, CVR) share the same date parameters, so changing the default applies to all of them.

### Technical Detail

**Line 288**: `useState<Period>("7d")` → `useState<Period>("30d")`

