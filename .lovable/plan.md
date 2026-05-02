## Why your site shows up as its own top referrer

Real data (last 14 days) confirms the leak on every site:

| Site | Self-referrer leaking through |
|---|---|
| livesinthebalance.org | `livesinthebalance.org` — 920 sessions |
| georgiaboneandjoint.org | `www.georgiaboneandjoint.org` — 52 sessions |
| apyxmedical.com | `apyxmedical.com` (60) + `www.apyxmedical.com` (2) |

Two root causes:

1. **`www.` vs apex mismatch.** The dashboard's self-referral filter compares the referrer to the exact domain saved on the site record. If the site is stored as `georgiaboneandjoint.org` but visitors hop from `www.georgiaboneandjoint.org` (or vice-versa), the filter misses it. Per the **Domain Normalization** memory, we already strip `www.` everywhere else — referrer normalization wasn't applied to the comparison set.
2. **Cross-subdomain hops aren't recognised as same-site.** Internal navigations between, e.g., `blog.example.com` → `example.com` get logged as referrals.

There's also some noise from legit external traffic that *looks* like self-referral (e.g. `renuvion.org` for apyxmedical.com — a sister brand), which is real but worth flagging separately.

## Plan

### Part 1 — Stop the self-referral leak (the actual bug)

**Normalize on both sides of the comparison** in every place that builds the "own domains" set:

- `src/hooks/use-realtime-dashboard.ts` (line ~253)
- `src/components/dashboard/TopPagesAndSources.tsx` (line ~58)
- `src/hooks/use-dashboard-overview.ts` (line ~119)
- `supabase/functions/dashboard-ai-insights/index.ts` (line ~119)
- `supabase/functions/archive-nightly/index.ts` (line ~163)

For each site domain, add **all variants** to the "own" set:
- `apex` (e.g. `example.com`)
- `www.apex`
- the registrable root (so `blog.example.com` → matches `example.com`)

And normalize the incoming referrer the same way before checking membership. Anything matching becomes `Direct`.

**Also fix at ingest time** in `supabase/functions/track-pageview/index.ts`: when `referrer_domain` matches the site's own root domain (after stripping `www.` and any subdomain), store it as `null` so future analytics, archives, and AI insights all stay clean. This stops new data from re-introducing the bug.

**Backfill**: a one-shot SQL migration to clear `landing_referrer_domain` and `referrer_domain` on existing rows where they match the owning site's normalized root. Scoped per-org, idempotent.

### Part 2 — Better "where is traffic actually coming from?"

The data you have is rich (UTM source/medium/campaign + referrer domain), but the dashboard surfaces it as a flat list of hostnames, which is why `google.com`, `www.google.com`, `bing.com`, `fb`, `facebook.com`, `m.facebook.com` all appear as separate rows.

Add a **Channel + Source view** to the Performance / dashboard area, reusing the classifier that already exists in `ChannelBreakdown.tsx` (Visitor Journeys page). It groups raw sources into:

- **Paid Search** (Google/Bing ads — utm_medium=cpc/ppc)
- **Paid Social** (Meta/TikTok/LinkedIn ads)
- **Organic Search** (Google/Bing/DuckDuckGo organic)
- **Organic Social** (Facebook/Instagram/LinkedIn/Reddit/etc. unpaid)
- **Email** (utm_medium=email or hs_email, mailchimp, etc.)
- **Referral** (other websites — the actual third-party referrals)
- **Direct** (no referrer / typed URL / self-referral after normalization)

For each channel, show: sessions, leads, CVR, and the **top 3 raw sources** that rolled up into it. Plus normalize variants:
- collapse `google.com` + `www.google.com` + `cn.bing.com` to canonical engine names
- collapse `facebook.com` + `m.facebook.com` + `l.facebook.com` + `fb` to "Facebook"
- collapse `instagram.com` + `l.instagram.com` + `ig` to "Instagram"

This goes into the existing **Attribution** card on the Performance page (replacing the current flat Sources/Campaigns table) and the **Top Sources** widget on the dashboard.

### Part 3 — Sanity surface

On the Attribution panel, add a small "Excluded as self-referral" footnote showing the count we filtered out (so it's transparent, not invisible). E.g. *"Excluded 920 self-referral sessions from livesinthebalance.org."*

## Files touched

**Dashboard (frontend):**
- `src/lib/source-normalize.ts` *(new)* — shared `normalizeDomain`, `expandSiteDomains`, `isSelfReferral`, `canonicalSource` helpers
- `src/hooks/use-realtime-dashboard.ts` — use shared helpers
- `src/hooks/use-dashboard-overview.ts` — use shared helpers
- `src/components/dashboard/TopPagesAndSources.tsx` — use shared helpers + canonical source collapsing
- `src/components/dashboard/AttributionSection.tsx` — switch from flat list to channel-grouped view with expandable sources
- `src/pages/Performance.tsx` — pass site domains down to AttributionSection so it can self-classify

**Edge functions:**
- `supabase/functions/track-pageview/index.ts` — null out self-referrer at write time
- `supabase/functions/dashboard-ai-insights/index.ts` — apply normalization
- `supabase/functions/archive-nightly/index.ts` — apply normalization

**Database:**
- One migration: backfill existing `sessions.landing_referrer_domain` and `pageviews.referrer_domain` rows that match owning site (normalized).

## Verification

After deploy, re-check the same query — every site's self-domain row should drop to zero, and the Attribution card should show a clean Channel breakdown with `Direct` absorbing the previously-leaking rows.

No plugin changes needed. No impact on the WP plugin onboarding work from earlier turns.