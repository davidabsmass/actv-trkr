

# Plan: Easy-to-Understand Summary Reports + SEO Insights (BETA)

This is a large feature set combining two things: (1) a new business-friendly reporting experience with plain-English summaries, and (2) an integrated SEO scanner adapted from the RankCoach AI project. Given the scope, I recommend building this in **two phases**.

---

## Phase 1: Reports Page Overhaul + Insight Engine

### Navigation Change
- Add **"Reports"** as a standalone nav item in `AppSidebar.tsx` (currently reports is embedded inside Performance tab)
- Route `/reports` to the new dedicated Reports page instead of redirecting to `/performance?tab=reports`
- Reports page gets **4 tabs**: Overview, Weekly Summary, Monthly Summary, SEO Insights

### Insight Engine (`src/lib/insight-engine.ts`)
Create a deterministic rule-based engine that generates structured findings from existing dashboard data. Each finding has: `type`, `category`, `page`, `metric_values`, `severity`, `confidence`, `recommended_action`, `positive_or_negative`.

Finding types to implement:
- `traffic_up` / `traffic_down` (threshold-based on sessions WoW)
- `lead_growth` / `lead_drop`
- `conversion_drop` / `conversion_gain`
- `high_exit_rate` (pages with high bounce vs site average)
- `mobile_dropoff` (device breakdown comparison)
- `form_abandonment` (form starts vs submissions)
- `seo_visibility_gain` / `seo_visibility_loss` (from SEO scan data, Phase 2)
- `high_intent_low_performance` (high traffic + low CVR pages)
- `strong_engagement_low_visibility` (good CVR + low sessions)

Data sources: `sessions`, `pageviews`, `leads`, `events`, `forms`, `broken_links`, `incidents`, existing `weekly_summaries`.

### Overview Tab
- **At a Glance**: 4 summary cards (Traffic, Leads, Conversions, Site Health) each showing current value, trend badge, 1-sentence AI-generated summary
- **Key Insights**: 3-5 cards from insight engine, each with category label, title, plain-English explanation, priority, optional suggested action
- **Needs Attention**: Top issues from insight engine (negative findings)
- **What's Working**: Positive momentum items

### Weekly Summary Tab
- Fetches from existing `weekly_summaries` table
- Enhanced layout: summary paragraph, key metric changes, top opportunities, recommended next steps
- AI paragraph generated from structured findings (not raw data)

### Monthly Summary Tab
- New edge function `generate-monthly-summary` that aggregates monthly data and uses AI to write an executive summary paragraph
- Sections: Month in Review, Performance Trends, Pages to Improve, Best Performers, Recommended Focus (max 3 items)
- Store results in a new `monthly_summaries` table

### AI Usage
- New edge function `reports-ai-copy` that accepts structured findings and returns plain-English summaries
- AI only rewrites pre-computed findings; never sees raw session data
- Uses `google/gemini-3-flash-preview` for speed/cost
- Tone: clear, business-friendly, specific, not robotic

### Database Changes
- New table: `monthly_summaries` (org_id, month, summary_text, top_performers, focus_areas, generated_at)
- New table: `seo_scans` (org_id, site_id, url, score, issues_json, scanned_at, platform) — for Phase 2

---

## Phase 2: SEO Insights Tab (BETA)

### Edge Function: `scan-site-seo`
Adapted from RankCoach AI's `scan-website` function, streamlined for ACTV TRKR:
- Fetches client site HTML (using site URL from `sites` table)
- Pre-checks: title, meta description, H1, canonical, OG tags, performance (blocking scripts, image dimensions, lazy loading)
- Sends structured findings to AI for plain-English fix descriptions
- Returns SEO score + categorized issues
- Stores results in `seo_scans` table
- Platform auto-detection (WordPress, Shopify, Wix, etc.)

### SEO Insights Tab UI
- **SEO Overview Cards**: Visibility, Ranking Movement proxy, Optimization Issues, Opportunity Pages
- **Issue Breakdown**: Grouped by severity (Critical/High/Medium/Low), expandable with plain-English fixes — adapted from RankCoach's `FullReport` component but simplified
- **SEO + Conversion Blended Insights**: Cross-reference SEO scan data with traffic/conversion data to produce insights like "This page is gaining organic traffic but not converting"
- **BETA badge** on the tab

### SEO Scoring
Port `seoScoring.ts` from RankCoach AI — weighted scoring system with base weights per impact level and severity multipliers.

---

## Settings Support
Add to Settings page:
- Weekly summary on/off
- Monthly summary on/off  
- SEO insights on/off
- Minimum traffic threshold for insights

---

## Empty States
All sections show clean, encouraging messages when data is insufficient.

---

## Technical Summary

| Item | Type | Details |
|------|------|---------|
| `src/lib/insight-engine.ts` | New file | Deterministic rule-based finding generator |
| `src/lib/seo-scoring.ts` | New file | Ported from RankCoach AI |
| `src/pages/Reports.tsx` | Major rewrite | 4-tab layout with new sections |
| `src/components/reports/` | New directory | OverviewTab, WeeklyTab, MonthlyTab, SeoTab, InsightCard, SummaryCard |
| `supabase/functions/reports-ai-copy/` | New edge function | Rewrites findings into plain English |
| `supabase/functions/scan-site-seo/` | New edge function | Adapted from RankCoach AI scan-website |
| `supabase/functions/generate-monthly-summary/` | New edge function | Monthly aggregation + AI summary |
| `monthly_summaries` table | New migration | Stores monthly summaries |
| `seo_scans` table | New migration | Stores SEO scan results |
| `AppSidebar.tsx` | Edit | Add Reports nav item |
| `App.tsx` | Edit | Update /reports route |
| Settings page | Edit | Add report/SEO toggles |

This is a substantial build. I recommend implementing Phase 1 first (the reporting overhaul + insight engine), then Phase 2 (SEO scanner integration) as a follow-up.

