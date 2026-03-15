

# Plan: Multi-Page SEO Scanning

## Problem
The scanner only scans the homepage. Users need to scan any page on their site.

## Changes

### 1. SeoTab UI (`src/components/reports/SeoTab.tsx`)
- Add a **URL input field** next to the Scan button, pre-filled with the site's homepage URL
- User can edit it to any path on their domain (e.g., `/pricing`, `/services`)
- Add a **scan history list** showing previous scans with their URL, score, date — clickable to view results
- When viewing a past scan, show its issues inline
- The "latest scan" view becomes "selected scan" view

### 2. Edge Function (`supabase/functions/scan-site-seo/index.ts`)
- Already accepts any `url` parameter — no changes needed to the function itself

### 3. SeoTab Scan History Query
- Fetch the last 10-20 scans from `seo_scans` table (already stores URL per scan)
- Group by URL so users can see score trends per page
- Default view shows the most recent scan across all pages

### 4. UI Layout
```text
┌─────────────────────────────────────────────┐
│ SEO Scanner [BETA]                          │
│ ┌──────────────────────────┐ ┌────────────┐ │
│ │ https://site.com/pricing │ │  Scan Now  │ │
│ └──────────────────────────┘ └────────────┘ │
│                                             │
│ Scan History                                │
│  / ................... 82  Mar 14           │
│  /pricing ............ 75  Mar 14  ← active │
│  /services ........... 91  Mar 13           │
└─────────────────────────────────────────────┘

┌─ Score Card (for selected scan) ────────────┐
│  75  Grade: B   Critical: 0  High: 1 ...    │
└─────────────────────────────────────────────┘

┌─ Issues (for selected scan) ────────────────┐
│  ...                                        │
└─────────────────────────────────────────────┘
```

### 5. Validation
- Ensure the entered URL belongs to the same domain as the configured site (prevent scanning arbitrary external sites)
- Strip trailing slashes, normalize

### Files Changed
| File | Change |
|------|--------|
| `src/components/reports/SeoTab.tsx` | URL input, scan history list, selected scan state |

No database or edge function changes needed — infrastructure already supports multi-page.

