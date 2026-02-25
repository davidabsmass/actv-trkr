

## Answers to Your Questions

### What counts as a conversion?
A **conversion** is any form submission that gets ingested into the system (via the WordPress plugin's form capture). Every form submit creates a **lead** record. The **Conversion Rate (CVR)** is calculated as:

**CVR = Leads / Sessions**

So if you had 100 unique sessions and 3 form submissions, your CVR would be 3%. You can adjust how much each form "counts" using the **lead weight** setting on the form's Settings tab (e.g., a newsletter signup could be weighted at 0.25 while a contact form is 1.0).

### What is a campaign?
A **campaign** refers to the `utm_campaign` parameter captured from URL query strings (e.g., `?utm_campaign=spring-sale`). When someone visits your site with UTM parameters, the tracker stores them on the session. If that visitor later submits a form, the lead is attributed to that campaign. The Attribution section on the dashboard groups sessions and leads by these campaign values so you can see which marketing efforts are driving results.

Currently, campaign attribution data only populates when your `traffic_daily`/`kpi_daily` aggregation includes `sessions_by_campaign` and `leads_by_campaign` metrics -- the aggregate function doesn't compute these yet, which is why the Campaign tab shows empty.

---

## Plan: Visitor Location Map on Dashboard

### The Problem
There is currently **no geolocation data** being captured. The `pageviews` table stores `ip_hash` but not country, city, or coordinates. We need to add geo-resolution and then display it.

### Implementation

#### 1. Database: Add geo columns to `pageviews` table
Add `country_code` (text, 2-char ISO) and `country_name` (text) columns to the `pageviews` table via migration.

Add a new `traffic_daily` metric type: `sessions_by_country` so the aggregation pipeline can roll up country data.

#### 2. Edge Function: Resolve IP to country in `track-pageview`
- Use the request's `CF-IPCountry` header (available automatically on Deno Deploy / Cloudflare-backed hosting) or a lightweight free geo API as fallback.
- Store the resolved `country_code` on the pageview record.
- This is zero-cost since `CF-IPCountry` is a standard header provided by the infrastructure.

#### 3. Aggregation: Update `aggregate-daily` function
- Add a new aggregation pass that groups pageviews by `country_code` and writes `sessions_by_country` rows into `traffic_daily`.

#### 4. Dashboard Hook: Fetch country data
- Add a query in `use-dashboard-data.ts` that pulls `traffic_daily` rows where `metric = 'sessions_by_country'` for the selected date range.

#### 5. Dashboard UI: World map component
- Create `src/components/dashboard/VisitorMapSection.tsx`.
- Use a lightweight SVG world map approach (inline SVG with country paths) rather than adding a heavy mapping library.
- Countries are shaded by session count using a color scale (lighter = fewer, darker = more).
- Include a sorted table below the map listing top countries with session counts.
- Place the component on the Dashboard between the Attribution and Content Performance sections.

### Technical Details

```text
┌─────────────────────────────────────────┐
│  track-pageview edge function           │
│  ┌──────────────────────────────────┐   │
│  │ Read CF-IPCountry header         │   │
│  │ Store country_code on pageview   │   │
│  └──────────────────────────────────┘   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  aggregate-daily edge function          │
│  ┌──────────────────────────────────┐   │
│  │ GROUP BY country_code            │   │
│  │ → sessions_by_country metric     │   │
│  └──────────────────────────────────┘   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  Dashboard                              │
│  ┌──────────────────────────────────┐   │
│  │ SVG world map + country table    │   │
│  │ Color-coded by session volume    │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Files to create/modify
- **Migration**: Add `country_code` and `country_name` to `pageviews`
- **`supabase/functions/track-pageview/index.ts`**: Read geo header, store country
- **`supabase/functions/aggregate-daily/index.ts`**: Add `sessions_by_country` aggregation
- **`src/components/dashboard/VisitorMapSection.tsx`**: New SVG map component
- **`src/hooks/use-dashboard-data.ts`**: Add country data query
- **`src/pages/Dashboard.tsx`**: Add VisitorMapSection to layout

