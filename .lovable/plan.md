

## Current State

The Reports page currently offers:
- **3 report templates**: Monthly Performance Report, Campaign Report, Weekly Brief
- **Date range selection** with calendar pickers and quick presets (7d, 14d, 30d, 60d, 90d)
- **Scheduled reports** (weekly/monthly with day-of-month selection)
- **Report history** with view/download

However, all three templates use the **same edge function** (`process-report`) which generates an identical "Monthly Performance Report" structure regardless of template. The Campaign Report and Weekly Brief produce the same output.

## Proposed Enhancements

### 1. Template-aware report generation
Update `process-report` edge function to produce different report structures based on `template_slug`:

- **Monthly Performance** (existing): Full 5-section report (Executive Summary, Growth Engine, Conversion Intelligence, UX Signals, Action Plan)
- **Weekly Brief**: Condensed summary — just KPI snapshot, top 3 changes vs prior week, and 1-2 action items. Shorter, faster to scan.
- **Campaign Report**: UTM/campaign-focused — group all metrics by `utm_campaign`, show per-campaign leads, sessions, CVR, and cost-per-lead (if `ad_spend` data exists). Skip device/geo sections.

### 2. Add report options beyond date
Add optional parameters users can configure before generating:

- **Compare to** dropdown: "Previous period" (default), "Same period last year", "None"
- **Focus filter**: Optional UTM source or campaign filter to scope the report to a specific channel
- These get stored in `report_runs.params` and used by the edge function

### 3. Update ReportViewer to handle different template shapes
The viewer currently hardcodes the 5-section layout. Add conditional rendering based on `report.templateSlug`.

## Implementation Steps

1. **Add UI controls** in Reports.tsx generate section: comparison mode select + optional campaign/source filter input
2. **Update `process-report` edge function** to branch logic by `template_slug`, producing tailored JSON for each template type
3. **Update `ReportViewer`** to conditionally render sections based on template type (weekly brief = compact card, campaign = campaign-grouped table)
4. **Deploy** updated edge function

## Technical Details

- `report_runs.params` already supports arbitrary JSON — no schema changes needed
- New params: `{ compare_mode: "previous" | "yoy" | "none", filter_source?: string, filter_campaign?: string }`
- Weekly Brief: skip Growth Engine and UX Signals sections, keep Executive Summary + top 3 recommendations
- Campaign Report: add `campaignBreakdown` array with per-campaign metrics, include `ad_spend` join for CPL calculation

