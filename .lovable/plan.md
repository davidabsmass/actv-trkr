

# Bug Fix Plan: Dashboard, Forms, and Performance Issues

This plan addresses 7 distinct issues across 3 areas.

---

## Issue 1: CVR Chart "Shifting" on Dashboard

**Root cause**: The dashboard auto-refreshes every 15 seconds (`refetchInterval: 15_000`). The CVR graph recalculates on each refresh. Since `dailyMap` only has entries for days with sessions data, slight timing differences in queries cause data points to shift between refreshes.

**Fix**: In `use-realtime-dashboard.ts`, build `dailyMap` by pre-populating every date in the range (iterating from `startDate` to `endDate`), so all days always appear -- even with zero values. This prevents data points from appearing/disappearing between refreshes.

---

## Issue 2: Form Health Panel Links Go to `/forms` Instead of Specific Form

**Root cause**: In `FormHealthPanel.tsx`, each form links to `/forms` (line ~93). It should link to `/forms?selected={form.id}` so the form detail opens directly.

**Fix**: Update the `Link` `to` prop to include the form ID as a query parameter: `/forms?selected=${form.id}`. Then update `Forms.tsx` to read the `selected` query param on mount and auto-select that form.

---

## Issue 3: Form Leaderboard Conversion Rate Uses Total Site Sessions as Denominator

**Root cause**: `FormLeaderboard` receives `sessions` (total site sessions) and uses it as the denominator for each form's CVR. This means a form with 9 submissions out of 3,000 site sessions shows 0.3% CVR, rather than the form-specific conversion rate. This is why the numbers diverge wildly from actual form conversion rates.

**Fix**: The leaderboard should clarify this is "site-wide CVR" (submissions / total site sessions), or ideally compute a form-specific rate. Since we don't have per-form page view counts readily available, the most honest fix is to:
1. Rename the column from "Conv %" to "Site CVR" with a tooltip explaining "submissions as a percentage of total site sessions"
2. Sort by submissions count (already done) rather than implying CVR ranking

This also affects **AI Insights** which likely uses the same inflated/deflated CVR numbers.

---

## Issue 4: Form Submission Counts May Be Off

**Root cause**: The leaderboard counts leads from the `leads` array filtered to the selected date range. If some submissions weren't properly ingested (timing, dedup, or cookie issues), counts will differ from the source form plugin's counts. The sorting is by submissions (correct), but the user reports Physician General shows 8 vs expected 9, Patient General shows 7 vs expected 9.

**Fix**: This is likely a data ingestion issue rather than a display bug. However, we should verify the `leads` query isn't hitting the 1000-row limit or being filtered incorrectly. Add a note in the leaderboard: "Based on tracked submissions" to set expectations.

---

## Issue 5: Sidebar Navigation Broken — Can't Click Other Items After Clicking Performance

**Root cause**: The `NavLink` for parent items like "Performance" navigates to `/performance`, and child items have URLs like `/performance?tab=analytics`. React Router's `NavLink` `isActive` matching likely causes the parent to block or overlap child links. The sidebar renders children unconditionally (always visible), but clicking the parent navigates away from the tab view.

**Fix**: Make parent nav items that have children act as expand/collapse toggles rather than navigation links. Only the child items should navigate. Alternatively, clicking "Performance" should navigate to `/performance?tab=analytics` (its first child) so the parent and children work together.

---

## Issue 6: Traffic Source ROI "Est Revenue" Uses a Hardcoded $150/Lead Default

**Root cause**: `TrafficSourceROI` has `estimatedValuePerLead = 150` as a default prop. This multiplies leads × $150 for every source, producing fabricated revenue numbers with no basis in real data.

**Fix**: 
1. Pull the actual `estimated_value` from the org's forms and compute a weighted average, OR
2. Only show Est Revenue when forms have `estimated_value` configured, otherwise show "—"
3. Add a note/tooltip explaining where the number comes from

---

## Issue 7: Attribution Data Not Updating (Stale After 1+ Hour)

**Root cause**: The realtime dashboard queries `sessions` and `leads` tables. New pageviews from manual site visits should create sessions via the tracker. If the user visited from Facebook/Bing/Google but those visits didn't generate new tracked sessions (e.g., tracker not installed, ad blocker, or UTM params not set), no new data would appear. The 15-second refresh interval is working; the issue is likely that casual browsing without proper UTM tags gets bucketed under existing sources like "direct."

**Fix**: This is expected behavior — attribution requires the tracker JS to be active and UTM parameters to be present. No code change needed, but we should communicate this in the UI (e.g., tooltip on attribution section).

---

## Summary of Code Changes

| File | Change |
|------|--------|
| `src/hooks/use-realtime-dashboard.ts` | Pre-populate dailyMap with all dates in range |
| `src/components/dashboard/FormHealthPanel.tsx` | Link to `/forms?selected={form.id}` |
| `src/pages/Forms.tsx` | Read `selected` query param to auto-select form |
| `src/components/dashboard/FormLeaderboard.tsx` | Rename "Conv %" to "Site CVR" with explanatory tooltip |
| `src/components/AppSidebar.tsx` | Make parent nav items with children non-navigating or redirect to first child |
| `src/components/dashboard/TrafficSourceROI.tsx` | Use form estimated_value instead of hardcoded $150; hide Est Revenue when not configured |

