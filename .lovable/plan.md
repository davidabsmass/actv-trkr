## Goal

Surface what subscribers are actually doing inside the dashboard — at the user level, the page level, and over time — inside the existing **Owner Dashboard** (`/owner-admin?secret=…`).

## What you'll see

A new **"Subscriber Activity"** section added below the existing "Feature Usage / AI Usage / Acquisition" cards, with three views in tabs:

### Tab 1 — Most Active Users (last 30 days)
Table with one row per real subscriber:

| Column | Example |
|---|---|
| User | regis.cain@apyxmedical.com |
| Org | Apyx Medical |
| Total events | 294 |
| Sessions (distinct days active) | 18 |
| Last seen | 2 hours ago |
| Top page | Forms (112) |
| 2nd page | Dashboard (84) |

Sortable by Events, Sessions, Last seen.

### Tab 2 — Page Popularity (last 30 days)
Bar list of every dashboard page across all subscribers:

| Page | Views | Unique users | % of users who visited |
|---|---|---|---|
| Dashboard | 330 | 10 | 100% |
| Forms | 272 | 8 | 80% |
| Performance | 171 | 8 | 80% |
| … | | | |

Toggle to filter out internal users (`@newuniformdesign.com`, `@absmass.com`, your gmail addresses) so you see what **paying customers** actually use.

### Tab 3 — Recent Activity Stream (live feed, last 200 events)
Chronological log:

```
10:42 AM   regis.cain@apyxmedical.com   →   Forms
10:41 AM   regis.cain@apyxmedical.com   →   Dashboard
10:38 AM   cassie.hankinson@apyxmedical.com   →   Reports
…
```

With an "Internal users" toggle and an org filter dropdown.

### Header KPIs (added to the existing top KPI strip)
- **DAU** — distinct users active today
- **WAU** — distinct users active last 7 days
- **MAU** — distinct users active last 30 days

## Date range

Defaults to last 30 days. Selector for **Today / 7d / 30d / 90d / All time** in the panel header.

## Technical details

- **No schema changes.** `user_activity_log` already has everything: `user_id`, `org_id`, `activity_type`, `page_path`, `page_title`, `created_at`.
- **No new edge function.** RLS on `user_activity_log` already grants `SELECT` to anyone with the `admin` role, and the OwnerAdmin page is already gated by the `admin-verify` secret + admin role.
- **Query strategy** — one `supabase.from("user_activity_log").select(...)` over the chosen window, joined client-side with `profiles` (email, full_name) and `orgs` (name). Profiles+orgs are small; activity log is ~2k rows total today, fine to aggregate in the browser.
- **Internal-user filter** — hard-coded list of email domains/addresses considered "internal" (newuniformdesign.com, absmass.com, smaccarroll11@gmail.com, mmccrrlldm@gmail.com). Toggle defaults to **on** (hide internal) so the dashboard reflects real customers.
- **New component** — `src/components/admin/SubscriberActivityPanel.tsx`, mounted in `src/pages/OwnerAdmin.tsx` between the existing Subscribers table and the Retention dashboard.
- **Page-title fallback** — some recent rows store `page_title` as the raw path (e.g. `/visitor-journeys`). The panel will map known paths to friendly names using the same lookup that lives in `use-activity-tracker.ts`, extended to cover `/visitor-journeys`, `/compliance-setup`, `/site-integrity`, etc.

## Out of scope (can add later)

- Feature-click tracking (today only `page_view` events exist; the `trackFeature(...)` hook is unused). I'll note this in the panel header so you know page views are the only signal until we instrument feature clicks.
- CSV export of the activity stream.
- Per-user drill-down modal showing one person's full session history.

Say the word and I'll build it.