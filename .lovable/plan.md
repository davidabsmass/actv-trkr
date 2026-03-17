

## Plan: Revise AI Limits and Auto-Generate Dashboard Insights on Login

### Changes Summary

**1. Update rate limits in 3 edge functions:**

| Function | Current | New |
|----------|---------|-----|
| `dashboard-ai-insights` | 10/day | 5/day |
| `reports-ai-copy` | 20/day | 15/day |
| `scan-site-seo` | 5/day | 10/day |
| `seo-suggest-fix` | 15/day | 5/day (no change) |

**2. Auto-generate AI insights on dashboard load**

- In `AiInsights.tsx`: add a `useEffect` that calls `handleGenerate()` on mount (once). The 4-hour server-side cache ensures repeated page loads don't burn AI calls.
- Keep the "Refresh" button for manual re-generation.
- Remove the empty "click to generate" placeholder state since it auto-fires.

**3. Add AiInsights to Dashboard.tsx**

- Import `AiInsights` component.
- Render it after the KPI row (before LatestSummary), passing the metrics from `periodData`, `topSource`, forms count, and primary focus from `useSiteSettings`.

### Files to Edit

| File | Change |
|------|--------|
| `supabase/functions/dashboard-ai-insights/index.ts` | Line 10: `DAILY_LIMIT = 5` |
| `supabase/functions/reports-ai-copy/index.ts` | Line 9: `DAILY_LIMIT = 15` |
| `supabase/functions/scan-site-seo/index.ts` | Line 217: change `>= 5` to `>= 10`, update error message |
| `src/components/dashboard/AiInsights.tsx` | Add `useEffect` to auto-generate on mount; remove empty-state placeholder |
| `src/pages/Dashboard.tsx` | Import `AiInsights`, import `useSiteSettings` for `primaryFocus`, render component after KPI row with metrics props |

