

## Problem

1. **No country data exists** in the `pageviews` table — every `country_code` is NULL. The tracking edge function reads `cf-ipcountry` or `x-country-code` headers, but these infrastructure headers are not being provided in Lovable Cloud's environment, so no geo data is ever stored.

2. **The map shows but is empty** — after the previous fix it renders the world map with an empty-state message, but there's no actual location data to display.

3. **User wants heat map visualization** — the current map uses flat opacity fills. A proper heat map with color gradients would be more visually impactful.

## Plan

### 1. Populate country data via IP geolocation in the edge function
Since `cf-ipcountry` headers aren't available, add a free IP geolocation lookup in `track-pageview/index.ts` as a fallback. Use the request's IP address with a free geo API (ip-api.com, no key needed, 45 req/min) when no header is present.

- Extract client IP from `x-forwarded-for` or connection info
- If no `cf-ipcountry`/`x-country-code` header, call `http://ip-api.com/json/{ip}?fields=countryCode` 
- Cache results in a simple in-memory Map (IP-hash → country) to avoid redundant lookups
- Store the resolved `country_code` on the pageview record

### 2. Enhance the map to a proper heat map
Update `VisitorMapSection.tsx`:
- Replace the linear opacity scale with a multi-stop color gradient (light yellow → orange → deep red) for a true heat map look
- Add a color legend bar below the map showing the gradient scale
- Add tooltip on hover showing country name and session count
- Keep the existing country bars below the map

### 3. Backfill existing pageviews with country data
Create a one-time database function or edge function to backfill `country_code` for existing pageviews using IP hashes. Since IPs aren't stored (only hashes), we can't retroactively look them up — but going forward all new pageviews will have country data. Add a note in the empty state that data will appear as new traffic arrives.

## Implementation Steps

1. **Update `track-pageview` edge function** — add IP-based geo fallback with in-memory cache
2. **Update `VisitorMapSection`** — heat map color gradient, legend bar, hover tooltips
3. **Deploy** the updated edge function

## Technical Details

- IP geolocation: `ip-api.com` free tier (45 req/min, no key). Cache by IP hash to stay under limit.
- Heat map colors: Use a 5-stop gradient from `#FEF3C7` (light) → `#F59E0B` (amber) → `#DC2626` (red) for intensity
- Legend: horizontal gradient bar with "Low" / "High" labels
- Tooltip: use a simple CSS tooltip on Geography hover showing country + count (no extra library needed)
- In-memory geo cache uses same SHA-256 IP hash already computed, TTL of 1 hour

