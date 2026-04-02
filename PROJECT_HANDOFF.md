# PROJECT HANDOFF — ACTV TRKR / Mission Control

> **Last updated**: 2026-04-02
> Paste this into the new chat: "Read PROJECT_HANDOFF.md first. Continue from where the last session left off."

---

## 1. Product Overview

ACTV TRKR is a white-label analytics + lead tracking SaaS for agencies managing WordPress sites. It includes:
- First-party pageview & session tracking (no GA4)
- Universal form capture (Gravity Forms, WPForms, CF7, Avada/Fusion, Ninja Forms, Fluent Forms)
- SEO scanning & one-click fix system
- Site uptime monitoring & domain/SSL expiry alerts
- Form liveness monitoring (hourly page-probe)
- AI-powered nightly/weekly/monthly summaries
- White-label branding per org
- Magic Login (one-click WP Admin access from dashboard)
- Dashboard snapshots (shareable read-only links)
- Conversion goals & attribution
- WooCommerce order tracking

---

## 2. Tech Stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS v3 + TypeScript 5 + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — Edge Functions (Deno), PostgreSQL, Auth, Storage
- **WordPress Plugin**: PHP plugin (`mission-metrics-wp-plugin/`) deployed via `serve-plugin-zip` Edge Function
- **Current Plugin Version**: **1.7.0** (set in `MM_PLUGIN_VERSION` constant + `serve-plugin-zip/index.ts` `CURRENT_PLUGIN_VERSION`)
- **Internationalization**: i18next with 10 locales (en, es, fr, de, it, pt, ar, ja, ko, zh)

---

## 3. Architecture — SET IN STONE

### Auth & Org Model
- Auth via Supabase Auth (`use-auth.ts`); `ProtectedRoute` in `App.tsx`
- Multi-tenant: `orgs` → `org_users` (role: admin/member) → `sites`
- Org context: `use-org.tsx` → `OrgProvider` wraps `AppLayout`; active org stored in `localStorage` key `mm_active_org`
- Roles table: `user_roles` with `app_role` enum (admin, moderator, user) — separate from `org_users`

### WordPress Plugin ↔ Backend Communication
- Plugin sends data to Edge Functions using **API key auth** (Bearer token → SHA-256 hashed → matched against `api_keys.key_hash`)
- **Pageview tracking**: client-side JS batches events every 30s via `navigator.sendBeacon` → `track-pageview` Edge Function
- **Form capture**: server-side PHP hooks + client-side universal DOM listener → `ingest-form` Edge Function (blocking HTTP)
- **Site health**: 5-minute cron → `ingest-heartbeat` Edge Function (sends WP version, PHP version, plugin list, etc.)
- **Security scanning**: `ingest-security` Edge Function
- **Broken link detection**: `ingest-broken-links` Edge Function
- **Form health probing**: hourly cron → `ingest-form-health` Edge Function
- **SEO fix polling**: 5-minute cron → `seo-fix-poll` Edge Function

### Entry Collection System — SET IN STONE

This is the most complex and critical subsystem. **Do not redesign it.**

#### How entries get into the system:
1. **Real-time**: WP plugin hooks into form submission events → sends payload to `ingest-form` Edge Function → creates `leads` + `lead_events_raw` + `lead_fields_flat` rows
2. **Batch ingest**: `ingest-form-batch` Edge Function accepts arrays of entries (used by backfill)
3. **Historical backfill**: Triggered by "Sync Entries" button on Forms page:
   - Frontend calls `trigger-site-sync` Edge Function with `force_backfill: true`
   - `trigger-site-sync` calls WP REST endpoint `/wp-json/actv-trkr/v1/backfill-entries`
   - WP plugin responds with entries in 12-second chunks, 50 entries per page
   - Edge Function runs a **resumable cursor-based loop** using `EdgeRuntime.waitUntil`
   - If not finished within 140s, it **self-chains** by calling itself with the cursor to continue
   - Requires plugin **v1.6.1+** (version guard enforced)

#### Entry reconciliation (sync-entries Edge Function):
- **Strict Authoritative Reconciliation**: WordPress entry IDs are the ONLY source of truth
- WP plugin sends active entry ID list per form → `sync-entries` compares against local `leads`
- Entries not in WP active set → trashed; entries in WP set but trashed locally → restored
- Deduplication: picks the lead with the most `lead_fields_flat` rows as canonical
- **Avada safety guards**: all-empty detection, duplicate ID set detection, full-trash prevention

#### Avada/Fusion Forms specifics:
- Multi-strategy extraction: primary table → secondary `wp_fusion_form_submission_data` fallback
- Data formats: JSON, PHP serialized, CSV-style blobs
- Schema-aware positional split for data-only blobs (looks up `lead_fields_flat` template)
- Pattern-based pre-assignment for Email, Phone, Zip, State before positional parsing
- Extended 60-second timeout for Avada backfills
- Legacy ID format: `avada_<timestamp>` → Canonical: `avada_db_<wp_id>`

#### Form Liveness Monitoring:
- Edge Function fetches form page HTML and checks for provider-specific selectors
- Results stored in `form_health_checks` table
- "Not Found" = form HTML not detected on page (may be behind modal/login, or page changed)
- "Pending" = no page_url set, so can't check
- Separate from entry sync — liveness is about whether the form renders on its page

---

## 4. Current Data State (as of 2026-04-02)

### Organizations
| Org | Timezone | Users | Sites |
|-----|----------|-------|-------|
| Apyx Medical | America/New_York | 7 | 1 (apyxmedical.com, v1.5.2) |
| Georgia Bone & Joint | America/New_York | 3 | 2 |
| livesinthebalance.org | America/New_York | 1 | 1 (v1.7.0) |
| New Uniform | America/New_York | 2 | 2 |
| CND Life Sciences | America/New_York | 0 | 1 |

### ⚠️ KNOWN ISSUE: Duplicate livesinthebalance.org site records
There are **TWO** site rows for `livesinthebalance.org` in different orgs:
- `b2b50c85` (org `3a19c536`, v1.7.0, active heartbeat) — **this is the real one**
- `c56915b0` (org `f1481904`, v1.6.2, stale) — **orphan, should be cleaned up**

The orphan org `f1481904` has 0 users and its site has stale data (451 leads in School Discipline Survey only). This was likely created during an earlier setup. The duplicate does NOT cause data routing issues because they belong to different orgs with different API keys, but it's confusing.

### livesinthebalance.org Form Counts (active site b2b50c85, as of Apr 2 2026):
| Form | External ID | Active Leads | Raw Events | Page URL |
|------|------------|-------------|------------|----------|
| School Discipline Survey | 2 | ~720,801 | ~802,305 | /school-discipline-survey/ |
| Bill of Rights | 5 | ~4,489 | ~4,489 | /advocacy/bill-of-rights/ |
| Contact Us Form | 6 | 0 | ~484,416 | /contact-us/ |
| Become an advocator | 4 | ~576 | ~576 | /advocacy/become-an-advocator/ |
| Newsletter Sign-up | 3 | ~484 | ~484 | /connect/ |
| 2025 Sign up for updates | 7 | ~16 | ~16 | /raising-human-beings/ |
| Quick Contact | 1 | 0 | 0 | (no page URL) |

**⚠️ Contact Us Form**: Has 484,416 raw events but 0 active leads — likely all trashed by reconciliation or a parsing issue. Needs investigation.

**⚠️ Quick Contact**: Has no page URL and 0 entries — may be a sidebar/footer widget form without a dedicated page.

### Form Liveness Check Results (Apr 2):
- ✅ School Discipline Survey — Detected
- ✅ 2025 Sign up for updates — Detected
- ❌ Newsletter Sign-up — Not Found (form HTML not detected on /connect/)
- ❌ Become an advocator — Not Found
- ❌ Bill of Rights — Not Found
- ❌ Contact Us Form — Not Found
- ⏳ Quick Contact — Pending (no page URL)

The "Not Found" results mean the Edge Function fetched those pages but couldn't find Gravity Forms HTML markers. Possible causes: forms loaded via AJAX/modal, page redesign, or shortcode rendering issue. This is **separate** from the entry import problem.

---

## 5. Key Edge Functions

| Function | Purpose |
|----------|---------|
| `track-pageview` | Receives batched pageview data from JS tracker |
| `ingest-form` | Single form entry ingestion |
| `ingest-form-batch` | Batch form entry ingestion (parallel groups of 10) |
| `ingest-heartbeat` | WP environment health data |
| `ingest-security` | Security scan results |
| `ingest-broken-links` | Broken link scan results |
| `ingest-form-health` | Form liveness probe results |
| `sync-forms` | Upserts form definitions from WP |
| `sync-entries` | Authoritative reconciliation of entry IDs |
| `trigger-site-sync` | Orchestrates full sync: WP sync → entry reconciliation → backfill → form checks |
| `serve-plugin-zip` | Generates downloadable plugin ZIP (version in `CURRENT_PLUGIN_VERSION` const) |
| `plugin-update-check` | WP plugin auto-update check endpoint |
| `scan-site-seo` | SEO crawler |
| `seo-suggest-fix` / `seo-fix-command` / `seo-fix-confirm` / `seo-fix-poll` | SEO fix pipeline |
| `check-uptime` | HTTP ping for uptime monitoring |
| `check-domain-ssl` | Domain/SSL expiry checks |
| `generate-wp-login` | Magic login link generation |
| `nightly-summary` / `weekly-summary` / `daily-digest` | AI summary generation |
| `dashboard-ai-insights` | On-demand AI insights |
| `ai-chatbot` | In-app AI assistant |
| `create-checkout` / `actv-checkout` / `actv-webhook` / `customer-portal` | Stripe billing |
| `aggregate-daily` | Nightly KPI aggregation |
| `archive-nightly` | Data archival to storage |
| `retention-cleanup` | Old data pruning |

---

## 6. Plugin Version History

- **v1.7.1** (current): Paginated GF entry ID collection for 700K+ entry sites, sync timeout 30s→120s, Edge Function sync timeout 8s→120s
- **v1.7.0**: Magic Login support, "heartbeat" → "response" terminology cleanup
- **v1.6.3**: Resumable cursor-based backfill with self-chaining
- **v1.6.1**: Synchronous backfill loop (minimum for reliable backfill)
- **v1.5.2**: Older version still running on apyxmedical.com
- **v1.4.4**: Pattern-based field pre-assignment for Avada
- **v1.3.12**: Minimum for Avada form entry discovery
- **v1.3.4**: Minimum for reliable entry reconciliation

All version strings must be updated in FIVE files when bumping:
1. `mission-metrics-wp-plugin/mission-metrics.php` (header + `MM_PLUGIN_VERSION`)
2. `mission-metrics-wp-plugin/readme.txt` (Stable tag + Changelog)
3. `supabase/functions/serve-plugin-zip/plugin-template/mission-metrics.php`
4. `supabase/functions/serve-plugin-zip/plugin-template/readme.txt`
5. `supabase/functions/serve-plugin-zip/index.ts` (`CURRENT_PLUGIN_VERSION` const)

The Settings page download button reads version from the `x-plugin-version` response header of `serve-plugin-zip`.

---

## 7. Stripe & Billing

- Stripe connector is linked
- `STRIPE_SECRET_KEY` secret is set
- Products/prices exist in Stripe
- Checkout flow: `create-checkout` → Stripe hosted checkout → `actv-webhook` handles events
- Customer portal: `customer-portal` Edge Function
- Subscriber profiles: `subscribers` table (synced from Stripe customer data including name/address)
- Subscription status: `subscription_status` table (org_id, status: active/past_due/canceled)

---

## 8. Settings Tabs

Settings page (`/settings`) has tabs: Sites, API Keys, Plugin, White Label, Notifications, SEO Visibility.
- **Removed from Settings**: Discovered Forms, Conversion Goals (moved to dedicated pages)

---

## 9. Dashboard Architecture

- Route: `/dashboard`
- Parallel queries with React Query (2-min stale, 10-min GC)
- Real-time polling every 60s via `use-realtime-dashboard.ts`
- Gap-fill strategy: historical from `kpi_daily`, missing days backfilled from raw tables
- Current day always overwritten with real-time head-only counts
- ErrorBoundary wraps main content
- Widgets: KPI Row, Trends Chart, Top Pages & Sources, Attribution, Funnel, AI Insights, Alerts, etc.

---

## 10. Monitoring Suite

- **Uptime**: Active HTTP pinging (HEAD with GET fallback), two-strike confirmation
- **Domain/SSL**: Expiry checks with 30/7/5/3/1-day notification thresholds
- **Form Liveness**: Hourly page-probe for form HTML presence. Detection enhanced in v1.7.1 to handle Gravity Forms AJAX rendering (gform_wrapper + gfield fallback)
- **WP Environment**: Plugin version, PHP version, WP version, active plugins, disk usage
- Terminology: "response" not "heartbeat" throughout UI

---

## 11. Open Issues / Next Steps

1. **livesinthebalance.org needs plugin update to v1.7.1**: The sync was timing out because GF entry ID collection only fetched first 5000 of 720K+ entries and Edge Function had an 8s timeout. Fixed in v1.7.1 — site needs to update plugin and re-sync.
2. ~~**Duplicate site record**~~: ✅ RESOLVED — orphan site `c56915b0` and org `f1481904` deleted via migration.
3. ~~**Form liveness "Not Found"**~~: ✅ RESOLVED — enhanced detection to handle GF AJAX rendering (gform_wrapper_FORMID placeholders).
4. **Quick Contact form**: No page URL, 0 entries. Will auto-discover page_url from first submission via `hydrateMissingPageUrls`. Until then, liveness check shows "Pending".
5. **apyxmedical.com on v1.5.2**: Needs manual update via WP admin. Can use Magic Login to access their WP admin and update.

---

## 12. Important Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Routes, ProtectedRoute, lazy loading |
| `src/pages/Dashboard.tsx` | Main dashboard |
| `src/pages/Forms.tsx` | Form list + sync UI + entry detail |
| `src/pages/Monitoring.tsx` | Uptime, form liveness, WP environment |
| `src/pages/Settings.tsx` | Settings tabs |
| `src/pages/Reports.tsx` | Weekly/monthly/SEO reports |
| `src/hooks/use-org.tsx` | Org context provider |
| `src/hooks/use-auth.ts` | Auth hook |
| `src/hooks/use-realtime-dashboard.ts` | Real-time polling |
| `src/hooks/use-dashboard-data.ts` | Dashboard data queries |
| `src/lib/plugin-download.ts` | Plugin version fetch helper |
| `supabase/functions/trigger-site-sync/index.ts` | Full sync orchestrator |
| `supabase/functions/sync-entries/index.ts` | Entry reconciliation |
| `supabase/functions/ingest-form/index.ts` | Single entry ingestion |
| `supabase/functions/ingest-form-batch/index.ts` | Batch entry ingestion |
| `supabase/functions/serve-plugin-zip/index.ts` | Plugin ZIP generation |
| `mission-metrics-wp-plugin/mission-metrics.php` | WP plugin main file |

---

## 13. Secrets (already configured)

SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, SUPABASE_DB_URL, STRIPE_SECRET_KEY, CRON_SECRET, ADMIN_SECRET, LOVABLE_API_KEY, SUPABASE_PUBLISHABLE_KEY

---

## 14. DO NOT

- Do NOT edit `src/integrations/supabase/client.ts` or `types.ts` (auto-generated)
- Do NOT edit `.env` (auto-managed)
- Do NOT store roles on the profiles table
- Do NOT use anonymous signups
- Do NOT mention "Supabase" to users — call it "Lovable Cloud"
- Do NOT redesign the entry collection / reconciliation system without explicit approval
