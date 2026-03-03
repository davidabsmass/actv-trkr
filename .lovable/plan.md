

## Dashboard Restructuring Plan

### Current State
The dashboard is a single monolithic page (`Dashboard.tsx`) containing KPIs, trends, attribution, content performance, funnel, form leaderboard, map, forecasts, AI insights, and alerts -- all in one scroll. Separate pages exist for Entries (form drill-down), Monitoring, Notifications, and Settings.

### Target Structure

```text
Sidebar
───────────────────
Overview        ← new (the "money page")
Performance     ← new (deeper analytics)
Forms           ← renamed from Entries
Monitoring      ← existing (no changes)
───────────────────
Notifications   ← existing (no changes)
Settings        ← existing (no changes)
```

### Changes Required

**1. Create `src/pages/Overview.tsx` (new file)**
The default landing page. Three rows:
- **Row 1 -- "Is Everything OK?" cards**: Site Status (UP/DOWN, last heartbeat, active incidents), Leads 7d (total + WoW %), Conversion Rate (overall + trend), Revenue Impact (estimated value + trend). Four cards in a grid, pulling from `useRealtimeDashboard` + `incidents` + `forms` (estimated_value).
- **Row 2 -- Trends**: Reuse existing `TrendsChart` with the traffic+leads dual-axis chart and 7d/30d/90d toggle. Include `WeekOverWeekStrip`.
- **Row 3 -- "Attention Required" panel**: Aggregate active incidents, conversion drops (from alerts), broken links count, domain/SSL expiring, renewals due. Each item with severity color and "View details" link routing to Monitoring or relevant section. Pulls from `incidents`, `broken_links`, `domain_health`, `ssl_health`, `renewals` tables.
- Keep: `AiInsights`, `WeeklySummary`, `ShareableSnapshot`, `OnboardingModal`, `DateRangeSelector`.
- Remove from this page: attribution, content performance, funnel, form leaderboard, map, forecast (moved to Performance).

**2. Create `src/pages/Performance.tsx` (new file)**
Deeper analytics page with sections:
- **Traffic**: Sessions, Pageviews, Sources breakdown, Visitor map.
- **Content Performance**: Top pages, opportunity highlights (high traffic / low conversion).
- **Funnel View**: Pageviews -> Form views -> Leads.
- Reuse existing components: `AttributionSection`, `TrafficSourceROI`, `ContentPerformance`, `VisitorMapSection`, `FunnelView`, `TrendsChart`.
- Respect `primaryFocus` ordering for section priority.

**3. Rename Entries -> Forms (`src/pages/Forms.tsx`)**
- Rename the file and update imports.
- Add a top summary row: Total submissions (with time range filter) and Failures count (from `form_submission_logs` where status='fail').
- Keep existing form leaderboard + drill-down (entries, analytics, settings tabs).
- Move `FormLeaderboard` component into this page as the default view above the form list.

**4. Update Sidebar (`src/components/AppSidebar.tsx`)**
- Replace current nav items with: Overview (`/dashboard`), Performance (`/performance`), Forms (`/forms`), Monitoring (`/monitoring`).
- Group label: "Dashboard" -> keep as-is or remove.
- Notifications and Settings remain in their own groups below.
- Remove: Reports, Exports from main nav (keep accessible via admin or move to Settings).
- Keep admin section (Clients, Setup & Inputs) unchanged.

**5. Update Routes (`src/App.tsx`)**
- Add `/performance` route -> `Performance`.
- Change `/entries` to `/forms` -> `Forms` (renamed).
- Keep `/dashboard` -> `Overview`.
- Keep `/monitoring`, `/notifications`, `/settings` unchanged.
- Keep `/reports` and `/exports` routes but remove from sidebar (accessible via direct URL or admin).

**6. Update `Dashboard.tsx`**
- This file becomes `Overview.tsx` (or we keep the filename and gut it). Simplest: keep as `Dashboard.tsx` but strip out the performance/attribution sections, leaving only the Overview content.

**7. Focus-aware reordering**
- Overview: Reorder the four status cards based on `primaryFocus` (lead_volume shows Leads first, marketing_impact shows Sessions first).
- Performance: Keep existing `focusOrder` logic for section ordering.

### Files Affected
| File | Action |
|---|---|
| `src/pages/Dashboard.tsx` | Gut to Overview-only content |
| `src/pages/Performance.tsx` | New -- deeper analytics |
| `src/pages/Entries.tsx` | Rename to Forms, add summary row + leaderboard |
| `src/components/AppSidebar.tsx` | Update nav items |
| `src/App.tsx` | Update routes |

### What Stays Untouched
- All edge functions, WP plugin, database tables, hooks
- Monitoring page, Notifications page, Settings page
- All existing dashboard components (reused, just relocated between Overview and Performance)
- Form tracking pipeline

