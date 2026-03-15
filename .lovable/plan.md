

# Plan: Promote SEO to Main Nav, Move Archives into Reports

## Changes

### 1. Sidebar Navigation (`src/components/AppSidebar.tsx`)
- Remove **Archives** from `telemetryItems`
- Replace **Reports** icon with `FileText` (keep as-is)
- Add **SEO** as a new standalone nav item using `Search` icon from lucide-react, with a BETA badge
- Final nav order: Dashboard, Performance, Reports, Forms, SEO, Monitoring

### 2. SEO Page (`src/pages/Seo.tsx`)
- Create a new standalone page that renders the existing `SeoTab` component
- Page title: "SEO Insights" with BETA badge

### 3. Reports Page (`src/pages/Reports.tsx`)
- Remove the **SEO Insights** tab
- Add an **Archives** tab that renders the existing Archives page content inline
- Final tabs: Overview, Weekly Summary, Monthly Summary, Activity Reports, Archives

### 4. Routing (`src/App.tsx`)
- Add route `/seo` → new `Seo` page
- Keep `/archives` as a redirect to `/reports?tab=archives` for backward compatibility

### 5. Archives Page (`src/pages/Archives.tsx`)
- Extract the main content into an `ArchivesContent` component that can be rendered both standalone and inside the Reports tab

