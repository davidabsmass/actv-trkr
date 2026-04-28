## The real problem

The funnel today silently re-anchors the **leads** lower bound to the install date when the selected window starts before install, while **sessions** stay anchored to the window. That mixes two different time spans on the same chart and produces unfair ratios like `2,175 sessions vs 3 leads`.

You're right: a funnel must compare like-for-like. If we don't have enough tracked history to fill the selected window, the funnel shouldn't pretend.

## Fix — make the funnel honest about its window

### Rule 1 — Always compare like-for-like
Sessions, form starts, and leads must all be counted using the **same effective window**. Define:

```
effectiveStart = max(selectedStart, installCutoff)
effectiveEnd   = selectedEnd
```

Both the sessions count and the leads count get clamped to `[effectiveStart, effectiveEnd]`. No more leads-only re-anchoring.

### Rule 2 — Hide the funnel when history is too short
If `effectiveEnd − effectiveStart < selectedRangeLength × 0.5` (i.e. install ate more than half the requested window), render a placeholder instead of the funnel:

> **Funnel unavailable**
> Your tracking has been live for 3 days. The conversion funnel will appear once we have a full {7/30/90}-day window of post-install data.
> *Showing partial data here would be misleading.*

Threshold: 50% of the requested window must be post-install. Always allow the funnel when the user picks a window entirely after install.

### Rule 3 — When shown, always label the actual window
The widget header always shows the real window it's plotting, e.g.:

> `Conversion Funnel · Apr 25 → Apr 28 (4 days)`

So the user knows exactly what's being compared. No hidden re-anchoring.

### Rule 4 — Comparison row uses the matching previous period
The "vs previous period" delta on overall CVR uses a previous window of the **same length as the effective window**, not the selected one. If that previous window also predates install, the delta is suppressed (shown as `—`).

### Out of scope (intentionally unchanged)
- The headline KPI tiles (Sessions / Form Fills / CVR) keep their current install-cutoff behavior — they already represent "what we captured live" and aren't a ratio between two metrics, so they're not misleading the same way.
- The Entries/Leads page keeps showing all 7,275 imported leads — that's correct for that view.
- DB schema, edge functions, security: untouched.

## Technical details

**Files to edit:**

1. `src/hooks/use-dashboard-overview.ts`
   - Compute `effectiveStart = max(dayStart, installCutoff)`.
   - Apply `effectiveStart` to **both** the sessions count and the leads count (currently only leads get the cutoff).
   - Return a new field `funnelWindow: { start, end, days, requestedDays, sufficient: boolean }` so the UI can decide whether to render the funnel.
   - `sufficient = days >= requestedDays * 0.5`.

2. `src/components/dashboard/FunnelWidget.tsx`
   - New optional prop `funnelWindow?: { start, end, days, requestedDays, sufficient }`.
   - If `funnelWindow && !funnelWindow.sufficient`: render the "Funnel unavailable" placeholder card (same glass-card chrome, neutral copy, no numbers).
   - If sufficient: render existing funnel + add a small subtitle under the title showing the date range and day count.

3. `src/pages/Dashboard.tsx` (line ~777) and `src/pages/Performance.tsx` (line ~68 area)
   - Pass `funnelWindow` from the hook into `FunnelWidget`.
   - Pass `orgCreatedAt` so the hook can compute it.

**No DB migration. No new edge function. No security changes. No new memory entry needed — this strengthens the existing [Conversion Rate Calculation](mem://logic/conversion-rate-calculation) and [Org Age Awareness](mem://logic/org-age-awareness) rules already in place.**
