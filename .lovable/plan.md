

## Stack All Findings in Two Half-Column Layout

### Current Layout
- **Row 1**: 2-column grid — "Key Insights" (left) | "Needs Attention" (right)
- **Row 2**: Full-width — "What's Working"

### New Layout
One persistent 2-column grid (`md:grid-cols-2`). All findings are split across two columns:
- **Left column**: All negative findings (Needs Attention) stacked vertically
- **Right column**: All positive findings (What's Working) stacked vertically

If there are no negative findings, positive fills both. Vice versa.

### File Change
**`src/components/reports/OverviewTab.tsx`** (lines 171–195)

Replace the current two separate sections with a single `grid grid-cols-1 md:grid-cols-2 gap-6` containing:
- Left: "Needs Attention" header + all negative findings
- Right: "What's Working" header + all positive findings

Remove the separate "Key Insights" section (its findings overlap with negative/positive split). Keep the combined findings list for the left column if preferred, or merge "Key Insights" into the negative column since most key insights are already negative-severity items.

