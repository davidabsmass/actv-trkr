

# ACTV TRKR — Launch Scope Cleanup and Feature Simplification

This plan covers 8 feature removals/renames and a pricing section overhaul across ~10 files.

---

## 1. Remove Forecasting

**Files:**
- `src/pages/Performance.tsx` — Remove `ForecastSection` import, remove `forecast` from `processedData`, remove `forecast` from `sections` object and all `focusOrder` arrays
- `src/components/dashboard/ForecastSection.tsx` — Delete file (or leave orphaned; removing import is sufficient)
- `src/pages/Reports.tsx` (MonthlyPerformanceViewer) — Remove forecast block from "Action Plan & Forecast" section; rename title to "Recommended Actions"
- `src/lib/report-pdf.ts` — Remove forecast block from "Action Plan & Forecast" HTML; rename to "Recommended Actions"
- `supabase/functions/process-report/index.ts` — Remove `forecast` from `actionPlan` return object (keep recommendations and contentOpportunities)

## 2. Remove Traffic Source ROI

**Files:**
- `src/pages/Performance.tsx` — Remove `TrafficSourceROI` import, remove `avgEstimatedValue` memo, remove `attribution` section (the one rendering `TrafficSourceROI`), remove `"attribution"` from all `focusOrder` arrays
- `src/components/dashboard/TrafficSourceROI.tsx` — Delete or leave orphaned

## 3. Remove Revenue Estimation

**Files:**
- `src/pages/Dashboard.tsx` — Remove `revenueImpact` memo, remove `revenueCard` from status cards, remove from all `focusOrder` arrays
- `src/pages/Reports.tsx` — Remove "Est. Value" column from Leads by Form table, remove "Pipeline Value" KPI from Form Health section
- `src/lib/report-pdf.ts` — Remove "Est. Value" column from Leads by Form table, remove "Pipeline Value" KPI from Form Health section
- `src/pages/Forms.tsx` — Remove "Estimated Lead Value" section and description mentioning ROI/revenue impact; keep the field itself but update copy to neutral ("Used for lead scoring")
- `src/pages/Entries.tsx` — Same as Forms.tsx
- `src/hooks/use-plan-tier.ts` — Remove `revenue_estimation` feature key

## 4. Rename "Growth Engine" → "Traffic Sources"

**Files:**
- `src/pages/Reports.tsx` — Change `title="Growth Engine"` to `title="Traffic Sources"`
- `src/lib/report-pdf.ts` — Change `"Growth Engine"` to `"Traffic Sources"`
- Data keys (`growthEngine`) in edge function and destructuring remain unchanged (internal only)

## 5. Rename "Conversion Intelligence" → "Conversion Insights"

**Files:**
- `src/pages/Reports.tsx` — Change `title="Conversion Intelligence"` to `title="Conversion Insights"`
- `src/lib/report-pdf.ts` — Change `"Conversion Intelligence"` to `"Conversion Insights"`

## 6. Remove Renewals Management

**Files:**
- `src/pages/Monitoring.tsx` — Remove "Renewals" tab trigger and `TabsContent`; remove `renewals` query, `addRenewal`/`deleteRenewal` mutations, `AddRenewalDialog` component; remove `"RENEWAL_DUE"` from `alertTypes` array; keep Domain & SSL tab (expiry alerts preserved)

## 7. Remove SMS Notifications

**Files:**
- `src/pages/Notifications.tsx` — Already uses `CHANNELS = ["in_app", "email"]` (no SMS). Confirmed clean.
- `src/pages/Monitoring.tsx` — Change `channels` from `["in_app", "email", "sms"]` to `["in_app", "email"]`
- `supabase/functions/process-monitoring-alerts/index.ts` — Remove `"sms"` from channels array and the SMS comment block

## 8. Soften "Real-Time" / "Performance Intelligence" Language

**Files:**
- `src/lib/report-pdf.ts` — Change `"Performance Intelligence"` to `"Activity Report"` in PDF header

## 9. Pricing Section Overhaul

**File:** `src/pages/Index.tsx`
- Replace two-tier pricing with single-tier $25/mo
- Remove billing toggle (monthly/annual)
- Replace subtitle with "ACTV TRKR"
- New feature list as specified
- New CTA: "Get Started"
- Add note below: "No bloated analytics stack. No scattered reports. Just clear visibility into what your website is doing."
- Remove astronaut pricing graphic (or keep as decorative — user preference, will keep for visual consistency)

---

## Summary of file changes

| File | Action |
|---|---|
| `src/pages/Performance.tsx` | Remove forecast, ROI imports and sections |
| `src/components/dashboard/ForecastSection.tsx` | Delete |
| `src/components/dashboard/TrafficSourceROI.tsx` | Delete |
| `src/pages/Dashboard.tsx` | Remove revenue impact card |
| `src/pages/Reports.tsx` | Rename sections, remove forecast/revenue columns |
| `src/lib/report-pdf.ts` | Rename sections, remove forecast/revenue in PDF |
| `src/pages/Monitoring.tsx` | Remove Renewals tab, SMS channel |
| `src/pages/Forms.tsx` | Update estimated value copy |
| `src/pages/Entries.tsx` | Update estimated value copy |
| `src/pages/Notifications.tsx` | Already clean (no SMS) |
| `src/pages/Index.tsx` | Rewrite pricing section |
| `src/hooks/use-plan-tier.ts` | Remove revenue_estimation feature |
| `supabase/functions/process-report/index.ts` | Remove forecast from actionPlan |
| `supabase/functions/process-monitoring-alerts/index.ts` | Remove SMS channel |

No database migrations needed. No navigation or routing changes. Existing layouts will tighten naturally as sections are removed.

