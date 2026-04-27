# Reports Overview — Replace "Form Submissions (30d)" widget

## Problem

The Reports page currently shows a plain list:

```text
Form Submissions (30d)
  Sign up for updates ........... 2 leads
  School Discipline Survey ...... 1 lead
```

It just repeats raw lead counts already shown elsewhere (Dashboard, Forms page) and offers no insight per form.

## What I'll change

In `src/components/reports/OverviewTab.tsx`:

1. **Remove** the existing `Form Submissions ({periodLabel})` card (lines 252–267).
2. **Replace** it with a **Form Performance ({periodLabel})** card that, for each form with activity in the selected period, shows:
   - Form name
   - **Leads** in period
   - **Share of total leads** (% of all leads in period) — bar visualization
   - **Conversion rate** (form leads ÷ sessions in period)
   - **Trend vs prior period** (▲/▼ %; suppressed for new orgs per existing `hasPreviousData` rule)
   - **Avg engagement score** of leads (0–100, from `leads.engagement_score`) — a quality signal, not just a volume one
3. **Add a header summary row** above the table:
   - Total submissions · Active forms (forms with ≥1 lead) · Top form · Period CVR
4. Keep the empty state: if no forms received submissions in the period, show "No form submissions in {periodLabel}" instead of hiding the section silently — matches the no-fake-UI policy (data-driven only).

## Data fetching changes

Extend the existing `reports_overview_live` query in `OverviewTab.tsx`:

- Add a parallel query against `kpi_daily` for `metric = 'leads_by_form'` over the **previous** period (we already fetch the current period) so we can compute per-form trend.
- Add a query against `leads` filtered by `org_id`, `submitted_at` in current range, selecting `form_id, engagement_score`, to compute **avg engagement score per form**. Cap with `.limit(1000)` and aggregate client-side (consistent with existing dashboard query strategy).
- Reuse already-fetched `currentSessions` to compute per-form CVR (`form.leads / currentSessions`).

No new tables, no migration, no edge function changes.

## Visual / UX

- Same `rounded-lg border border-border bg-card p-5` card styling as today.
- Top 8 forms by leads, with a "Show all" expander if more exist.
- Tooltip (`IconTooltip`) next to the title explaining: "Per-form performance for the selected period. CVR uses total site sessions as the denominator."
- Trend cell hidden when `hasPreviousData === false` (consistent with rest of the page / org-age-awareness rule).

## Out of scope

- No changes to Activity Reports tab, Monthly Performance Viewer, archives, or the WP plugin.
- No new translations added in non-English locales in this pass; English strings only — existing i18n fallback handles it.
