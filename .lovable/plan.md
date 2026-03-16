

## Issues Identified

### 1. No visible time period on "At a Glance" cards
The Overview tab fetches **last 7 days vs. prior 7 days** (lines 67-69 of OverviewTab.tsx), but the UI labels just say "Traffic", "Leads", "Conversion" with no date context. The nightly summary also covers a 7-day window but only shows its generation timestamp — the "At a Glance" section header has zero date labeling.

### 2. No export option on the main Reports page
The Activity Reports sub-tab has generate/download, but the top-level Reports page and the Overview/Weekly/Monthly tabs have no export or download button.

---

## Plan

### A. Add clear time-period labeling to Overview tab

1. **"At a Glance" section header**: Change from just "At a Glance" to include the date range, e.g. `"At a Glance — Mar 9–16 vs Mar 2–9"`. When nightly summary is used, pull `period_start` / `period_end` from the nightly record. When live fallback is used, compute from the `start` / `prevStart` / `prevEnd` variables already in scope.

2. **SummaryCard labels**: Update from generic "Traffic" → `"Traffic (7d)"`, "Leads" → `"Leads (7d)"`, "Conversion" → `"CVR (7d)"` to make the period explicit on each card. The `% change` badge should also get a subtle tooltip or sub-label like "vs prior 7 days".

3. **Nightly Summary Banner**: Already shows the generation date — add the period range: `"Covering Mar 9–16, 2026"`.

### B. Ensure metric accuracy

4. **Verify nightly fallback logic**: The current code correctly skips nightly summaries with zero metrics and falls back to raw `sessions` / `leads` counts. No change needed here, but add a small "Data source" indicator (e.g., "Live" vs "Cached summary") so it's transparent.

5. **Findings grounded in data**: The insight engine (`insight-engine.ts`) already uses deterministic thresholds — no AI hallucination risk. No changes needed to the engine itself, but the InsightCard should display the actual metric values it references (e.g., "Sessions dropped from 245 → 112"). The `metric_values` field is already in the Finding type but not rendered — surface it.

### C. Add Export button to Reports page header

6. **Add a "Generate Report" shortcut** on the main Reports page header (next to the page title). This button triggers the same `generateReport` mutation already in `ActivityReportsTab`, creating a report run and invoking `process-report`. This avoids forcing users to navigate to the Activity Reports tab just to export.

### Technical Details

**Files to modify:**
- `src/components/reports/OverviewTab.tsx` — add date range to section header and card labels; surface `metric_values` in InsightCard
- `src/components/reports/InsightCard.tsx` — render `metric_values` from findings
- `src/pages/Reports.tsx` — add "Generate Report" button in page header area

**No database or edge function changes required.**

