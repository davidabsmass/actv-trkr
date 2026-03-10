

## Attribution Section Redesign

Replace the current Attribution section with a new layout matching the provided mockup.

### Assets to add
- `satellite-bgd.jpg` -- new background image (space/planet scene)
- `satellite-chart.png` -- Form Performance Leaderboard table image
- `satellite-chart-tiny.png` -- "Total Submissions 42" stat card
- `satellite.png` -- satellite graphic

### Layout (matching mockup)
- Background: `satellite-bgd.jpg`, cover, center
- 12-column grid: left 7 cols for imagery, right 5 cols for text
- **Left side (col-span-7)**: Relative container with:
  - `satellite-chart.png` as the main leaderboard image (bottom-left area)
  - `satellite-chart-tiny.png` floating above/right of the leaderboard (absolutely positioned)
  - `satellite.png` could optionally be placed if desired (not prominent in the mockup reference but provided as an asset)
- **Right side (col-span-5)**:
  - Pill badge: "Form Efficiency" (with clipboard icon)
  - Headline: "Complete Visibility Into Your Forms" (Funnel Display font)
  - Body text about form syncing, submissions, failures, conversion rates, exports, and alerts
- Remove the old `attributionFeatures` bullet list from this section

### Changes
- **`src/pages/Index.tsx`**: Replace the Attribution section (~lines 351-382) with the new layout, import new assets, update content to match the mockup text

