

# Add Site Connection Status & Manual Site Setup

## The Problem

You installed the plugin on WordPress, but there's no way to know if it's actually connected. The system auto-creates a site record when the first pageview arrives, but:

1. There's no UI showing connected sites or connection status
2. If the plugin hasn't sent data yet (or the API key/endpoint isn't configured correctly), you're left guessing
3. The database currently has **zero sites and zero pageviews**, meaning the plugin either hasn't fired yet or isn't configured correctly on the WordPress side

## What Gets Built

### 1. Sites section in Settings — show connected sites

A new "Connected Sites" card on the Settings page that:
- Lists all sites registered to your org (domain, type, plugin version, first seen date)
- Shows an empty state with setup instructions if no sites exist yet
- Includes a "Test Connection" button that hits the `track-pageview` endpoint with a test event from the browser to verify the API key works

### 2. Onboarding — add website URL step

After creating the org and getting the API key, add a field to enter the website domain. This pre-registers the site in the `sites` table so:
- The dashboard knows what to expect
- You can verify connection before leaving onboarding

### 3. Dashboard — connection status banner

When the org has no sites (or no pageviews in the last 24h), show a banner at the top of the dashboard:
- "No data received yet — make sure the plugin is activated on your WordPress site"
- Link to Settings for troubleshooting

## Technical Details

### Settings: New `SitesSection` component
- Query `sites` table filtered by `orgId`
- Display domain, type, plugin_version, created_at
- Empty state with plugin setup checklist

### Onboarding: Add domain input
- Add optional "Website URL" field after org creation success screen
- On submit, insert into `sites` table via the existing `sites_write` RLS policy (allows admin/member insert)
- Extract domain from URL using `new URL(input).hostname`

### Dashboard: Connection banner
- Check if `sites` query returns empty array
- Render a dismissible info banner with setup guidance

### Files to create/modify
- **Create**: `src/components/settings/SitesSection.tsx`
- **Modify**: `src/pages/Settings.tsx` — add SitesSection
- **Modify**: `src/pages/Onboarding.tsx` — add website URL input on success screen
- **Modify**: `src/pages/Dashboard.tsx` — add connection status banner
- **Add hook**: `useSites(orgId)` in `use-dashboard-data.ts`

No database changes needed — the `sites` table and its `sites_write` INSERT policy already exist.

