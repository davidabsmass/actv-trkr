## Two issues, one plan

### Part 1 — Why your Cloud instance is working so hard

I pulled your scheduled jobs. You have **34 active cron jobs**, several running at very aggressive intervals against a single shared Postgres compute instance:

| Frequency | Jobs |
|---|---|
| **Every 5 seconds** | `process-email-queue` ⚠️ (this alone = 17,280 invocations/day) |
| **Every minute** | `process-alerts-1min`, `process-monitoring-alerts-every-minute` |
| **Every 5 min** | `check-tracking-health-5min`, `dispatch-support-access-summaries`, `process-stalled-alerts-5min` |
| **Every 10 min** | `check-uptime-10min`, `form-import-watchdog` |
| **Every 15 min** | `reconcile-forms-cron-15min`, `reconcile-install-integrity-15min`, `retention-flow-dispatcher` |

On top of that you have **120 edge functions**, the largest being `trigger-site-sync` (1,328 lines), `ingest-form` (924), and `nightly-summary` (547). Every cron tick wakes Postgres, opens connections, runs queries, and (often) calls `pg_net` to invoke an edge function — which round-trips back to the DB. That is your CPU.

**The single biggest culprit is `process-email-queue` running every 5 seconds.** For a queue that drains in seconds when there's mail and is empty 99% of the time, this is a continuous polling tax on the DB. Most well-designed email queues run every 30–60 seconds, or are triggered by an `INSERT` trigger + `pg_notify`.

#### Recommended fixes (Part 1)

1. **Slow `process-email-queue` from 5s → 30s** (or convert to trigger-driven). Drops ~15,000 unnecessary invocations/day.
2. **Consolidate alert processors** — `process-alerts-1min` and `process-monitoring-alerts-every-minute` both run every minute. Merge into one job, or stagger to every 2 min.
3. **Audit `check-tracking-health-5min`** — for the typical fleet, every 10–15 min is plenty. Same for `dispatch-support-access-summaries`.
4. **Add a query-cost dashboard query** so we can see which functions are actually generating load (top queries by `total_exec_time` from `pg_stat_statements`) before further trimming.
5. After trimming, recheck Cloud usage in 24h. If still high, the next lever is upgrading the Cloud instance size (Project → Cloud → Advanced settings → Upgrade instance), but I'd rather cut waste first.

I'll present the trimmed schedule as a migration for your approval before applying it. Nothing functional changes — just polling cadence.

### Part 2 — Make `/` SEO + AI-agent friendly

Current state of the landing page (`src/pages/Index.tsx` + `index.html`):

- ❌ `<title>` is just "ACTV TRKR"
- ❌ `<meta description>` is "ACTV TRKR Dashboard" (generic, doesn't match the actual product copy)
- ❌ No JSON-LD structured data (Organization, SoftwareApplication, FAQPage, Product/Offer)
- ❌ No `sitemap.xml`
- ❌ No `llms.txt` (the emerging convention for AI agents like ChatGPT, Claude, Perplexity)
- ❌ OG image points to a stale Lovable preview screenshot
- ❌ Logged-in users get auto-redirected to `/dashboard` — fine for humans, but Googlebot/GPTBot also hit `/` and need the marketing content. We must make sure the redirect is client-side only (it already is via `useEffect`, so SSR/crawlers see full HTML — good), but we should still verify the static HTML in `index.html` carries the real headline.
- ✅ Has `<h1>`, semantic `<section>` tags, alt text on most images, skip-to-content link, canonical tag

#### Changes I'll make

**A. `index.html` head rewrite**
- Real `<title>`: *"ACTV TRKR — WordPress Lead Tracking, Form Capture & Site Health"*
- Real `<meta description>` (~155 chars) using the hero copy
- Add `<meta name="keywords">` with focused terms (WordPress analytics, lead attribution, form tracking, Gravity Forms tracking, etc.)
- Update `og:title`, `og:description`, `twitter:*` to match
- Replace stale OG image URL with `/actv-trkr-og.jpg` (I'll generate a clean 1200×630 from existing brand assets)
- Add explicit `<meta name="robots" content="index, follow, max-image-preview:large">`
- Add JSON-LD blocks (inline in `<head>`):
  - `Organization` (name, logo, url, sameAs)
  - `SoftwareApplication` (name, applicationCategory, operatingSystem: WordPress, offers with $49/mo price, aggregateRating placeholder removed unless you have real reviews)
  - `FAQPage` mirroring the FAQ section content
  - `WebSite` with `SearchAction` (optional)

**B. New static files in `public/`**
- `sitemap.xml` listing `/`, `/auth`, `/privacy`, `/terms`, `/dpa`, `/cookie-policy`, `/accessibility`, `/data-rights`
- `robots.txt` updated to reference the sitemap and explicitly allow `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot` (AI crawlers)
- `llms.txt` — concise plain-text summary of the product, key features, pricing, and links. This is the file ChatGPT/Claude/Perplexity look for when summarizing a site.
- `llms-full.txt` — extended version with FAQ content and feature deep-dives, so AI agents can answer detailed questions about ACTV TRKR without scraping the React bundle.

**C. `Index.tsx` semantic improvements**
- Wrap each section's heading region in proper landmarks (`<header>`, `<main>`, `<footer>` if missing)
- Demote duplicate `<h2>` "Everything You Need" pattern; ensure exactly one `<h1>` per page
- Add `aria-label` to icon-only buttons (sign in/logout arrow button)
- Verify all `<img>` tags have meaningful `alt` text (most do — I'll fix any "Astronaut" / "Satellite" generics to describe what they show)

**D. Pre-rendered static fallback (lightweight)**
- Inject the hero `<h1>` and first paragraph directly into `index.html` `<body>` (hidden under the React root or as `<noscript>`) so crawlers that don't execute JS still see the value proposition. Modern Googlebot does run JS, but GPTBot, older crawlers, and link-preview bots often don't.

### Out of scope (ask if you want it)

- Server-side rendering / static prerender (`vite-plugin-ssr` or migrating to Next/Astro) — biggest possible SEO win but a large refactor.
- Real product screenshots optimized for OG image (I'll use existing `helmet.png` brand asset unless you provide a custom one).

### Technical summary

```text
Files I'll touch:
  index.html                     (head rewrite + JSON-LD + noscript hero)
  public/robots.txt              (AI bot allow-list + sitemap ref)
  public/sitemap.xml             (new)
  public/llms.txt                (new)
  public/llms-full.txt           (new)
  public/actv-trkr-og.jpg        (new, generated)
  src/pages/Index.tsx            (semantic cleanup, alt text, aria)

Migration:
  Adjust 3-5 cron schedules (process-email-queue, alert processors,
  tracking-health). Reversible.
```

Approve and I'll implement Part 2 in full, plus prepare the cron-trim migration for your sign-off before running it.