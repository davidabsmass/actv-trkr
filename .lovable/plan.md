

## Add Site from Settings

Right now, new websites can only be registered during initial onboarding. You need an "Add Site" button in the Settings page so you can register additional websites at any time.

### What will be built

**SitesSection component** (`src/components/settings/SitesSection.tsx`):
- Add an "Add Site" button that opens a small inline form (URL input + Add button)
- When submitted, it extracts the hostname from the URL and inserts a row into the `sites` table (same logic as onboarding)
- After success, the sites list refreshes to show the newly added site
- Includes a delete/remove option per site for cleanup

### Technical details

- The `sites` table already has an RLS INSERT policy (`sites_write`) allowing org admins and members to insert
- Reuse the URL-to-hostname extraction logic from `Onboarding.tsx`
- Invalidate the `["sites", orgId]` React Query cache on success
- No database changes needed — existing schema and policies support this

