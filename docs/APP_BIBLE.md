# ACTV TRKR App Bible

> The single source of truth for every subscriber-facing function and process.
> Reviewed and signed-off in-app at **/admin-setup → App Bible** before each release.

## How this document is used

1. Engineering keeps this file in sync with reality on every PR that touches a subscriber-visible behavior.
2. Before tagging a release, an admin loads `/admin-setup → App Bible` and signs off **every section** against the current plugin/app version.
3. Until every section is signed off for the active version, a banner appears on admin pages reminding the team.

Section keys below match the keys used in `src/components/admin/AppBibleChecklist.tsx`. Do not rename keys without updating both.

---

## 1. Subscriber lifecycle  *(key: `lifecycle`)*

The full path a paying customer takes, from checkout to active monitoring.

- **Checkout** — Stripe via `create-checkout` edge function. Plan: $49/mo Multi-Site.
- **Account provisioning** — On first auth, `provision-org` (or onboarding hook) creates the `orgs` row, `subscribers` row, default `consent_config`, default `site_settings`, and `customer_profiles` record.
- **Onboarding flow** — `/onboarding` collects website count range, customer type, primary focus. Personal email domains (gmail, etc.) are auto-routed to the personal-tier path.
- **Plugin install** — Subscriber downloads `actv-trkr-latest.zip` from `/settings → Plugin`. Plugin auto-registers the site on first heartbeat; no manual URL entry required.
- **Site verification** — `check-site-status` runs after install, then `check-tracking-health` every 5 minutes determines tracker status.
- **First-touch auto-sync (NEW CUSTOMER GUARANTEE)** — within 10 minutes of the first heartbeat from a new site, the platform MUST automatically:
  1. Register the site in `sites` (domain-normalized).
  2. Run `check-site-status` + `check-tracking-health` to populate uptime/tracker state.
  3. Run `manage-import-job?action=discover` to populate `form_integrations` AND auto-create `form_import_jobs` for every form with un-imported entries.
  4. Run `check-domain-ssl` to populate domain/SSL expiry.
  5. Trigger `seo-scan` to seed the SEO module with at least a Summary tier baseline.
  6. Enqueue a "welcome — your site is live" transactional email.
  No subscriber should ever land on `/dashboard`, `/monitoring`, `/forms`, or `/seo` and see "no data" for a site that has reported a heartbeat. If they do, that is a bug — see §19 (Auto-sync contract).
- **Active state** — Site appears in dashboard, monitoring, and reports surfaces.

**Failure recovery**:
- Stripe webhook missed → Owner can manually create the org via `/admin-setup → Clients`.
- Plugin never reports → "Re-scan Forms" button on `/settings → Form Import` calls `manage-import-job?action=discover`, which (a) discovers forms via the WP plugin (or falls back to the existing `forms` table), AND (b) auto-creates `form_import_jobs` for every form with un-imported entries. The `process-import-queue` cron worker (every 2 min) drains the jobs. See §4 for full details.
- First-touch auto-sync failed → `/admin-setup → New Customer Health` surfaces any new site (<7 days old) that is missing forms discovery, monitoring data, or SEO baseline, with a one-click "Re-run onboarding sync" action.

---

## 2. Authentication & access  *(key: `auth`)*

- **Sessions**: 1-hour access token, 1-week refresh token (per `mem://auth/session-policy`).
- **Roles**: stored in `public.user_roles` (never on profiles). `app_role` enum: `admin`, `moderator`, `user`. Org-scoped roles in `org_users`.
- **Owner**: `OWNER_EMAIL` constant, full system access, lands on `/admin-setup`.
- **Org admins**: see white-label, plugin section, API keys, form import.
- **Branded auth emails**: signup confirmation + welcome use the astronaut header banner; all transactional emails use the standard template.

---

## 3. Tracking pipeline  *(key: `tracking`)*

- **tracker.js** (multi-layered transport: `fetch → sendBeacon → image pixel`) lives in the WordPress plugin.
- **Ingestion endpoints**: `track-pageview`, `track-event`, `ingest-heartbeat`, `ingest-form-batch` — all hardened with API key auth, origin allowlist, schema validation, rate limits.
- **Domain normalization**: strips `www.` at site registration AND every ingestion endpoint.
- **Consent enforcement**: in `strict` mode (default for new orgs in EU/UK), the tracker is 100% inert until consent. No session ID, no pageview, no event, no fingerprint.
- **Visitor identity**: lightweight cookie + server-side aggregation. Full activity timeline available per lead.
- **Health monitoring**: `check-tracking-health` runs every 5 min. States: Active → Warning → Inactive after thresholds.

---

## 4. Forms ingestion  *(key: `forms`)*

- **3-layer architecture**: Discovery (REST scan) → Background Backfill (`sync-forms`) → Real-time webhook.
- **Supported builders (v1.16.9+)**: Gravity Forms (strict authoritative), Avada/Fusion (post type `fusion_form`, strict authoritative), WPForms, Contact Form 7 (requires Flamingo for entry storage), **Ninja Forms**, **Fluent Forms**. All six register through `MM_Adapter_Registry::init()` and implement the `MM_Import_Adapter` interface (`discover_forms`, `count_entries`, `fetch_entries`).
- **Form Capture (formerly "Universal Form Capture")**: the user-facing label on the landing page is **"Form Capture"**. The plugin still describes itself internally as "first-party pageview tracking and universal form capture" in `mission-metrics.php` — that string is internal copy and is intentionally left unchanged.
- **Field mapping**: canonical attributes (`name`, `email`, `phone`, `company`, `message`) editable per form in `/forms → Field Mapping`.
- **Stability lock**: per `mem://data/form-parsing-stability`, parsing logic is finalized. No structural changes without explicit approval.

### Pipeline guarantees (the contract)

1. **Spam threshold**: any form reporting > 50,000 entries is auto-quarantined as `needs_review`. The Settings UI shows a yellow "Spam-bombed — manual review required" badge with a **Force import anyway** action that bypasses the threshold.
2. **Junk integrations are not auto-jobbed**: discovery and the watchdog both refuse to create jobs for forms above the junk threshold. Only an explicit Force import creates one.
3. **No silent failures**: every job records `last_error` on failure. Stuck jobs (>30 min in `pending`/`running` with no signal) are released by the watchdog and surfaced in `/admin-setup → Form Import Health`.
4. **Drift detection**: the `form-import-watchdog` cron (every 10 min) compares live WP entry count vs `total_entries_imported` for every active integration. Any gap > 0 with no active job triggers a new pending job, then kicks `process-import-queue`.
5. **Self-healing of needs_review**: if a previously junk form drops below the threshold (cleaned up in WP), the watchdog flips it back to `detected`.
6. **Admin observability**: `/admin-setup` (owner-only) renders the Form Import Health panel with per-integration drift, stuck-job badges, and "Run queue now" / "Run watchdog" manual triggers.
7. **Auto-discovery on first heartbeat**: a new site MUST get a `manage-import-job?action=discover` call within 10 min of its first heartbeat. This is enforced by §19 Auto-sync contract.

### Two-table model

The forms pipeline maintains two distinct tables. They are NOT interchangeable:

| Table | Populated by | Read by |
|---|---|---|
| `forms` | `trigger-site-sync`, real-time webhook, tracker auto-discovery | Dashboard widgets, `/forms` page, conversion analytics |
| `form_integrations` | `manage-import-job?action=discover` only | `/settings → Form Import` panel (the re-scan UI) |

If `forms` has rows but `form_integrations` is empty, the Settings UI will show "0 forms" even though forms exist elsewhere in the app. The fix is to run discover (next section).

### Re-scan / discovery flow

The "Re-scan Forms" button in `/settings → Form Import` calls `manage-import-job?action=discover`. The function does THREE things in one call:

1. **Discover (primary)**: POST to the WP plugin's `/actv-trkr/v1/import-discover` endpoint (60s timeout). On success, upserts results into `form_integrations`.
2. **Discover (fallback)** when WP plugin times out, returns 5xx, or returns 0 forms: backfill `form_integrations` from any non-archived rows already present in the `forms` table for that site.
3. **Auto-import**: for every discovered form with `entry_count > 0` that isn't already fully imported and has no active job, insert a `form_import_jobs` row with `status='pending'`. The `process-import-queue` cron worker (every 2 min) drains pending jobs by calling `manage-import-job?action=process` → WP plugin `/import-batch` → `ingest-form-batch`.

Auto-import is skipped when: `entry_count` is 0; the discover path was the `forms_table` fallback (counts unknown); the integration is already fully synced; or an active/pending/stalled job already exists.

Response shape: `{ ok, discovered, auto_started_jobs, skipped_jobs, source: "wp_plugin" | "forms_table", wp_plugin_error, forms[] }`. The fallback guarantees the Settings UI never displays "0 forms" when forms already exist in the database.

**WP plugin auth (do not regress):** `permission_callback` is `MM_Forms::verify_key_hash`, which compares `hash('sha256', $opts['api_key'])` against the request body's `key_hash`. The edge function sends `api_keys.key_hash` (already SHA-256 of the raw key) — these match because the plugin re-computes the same hash from its stored raw key. Do NOT double-hash on either side or send the raw key over the wire.

---

## 5. Dashboard surfaces  *(key: `dashboard`)*

Required widgets in the order specified by `mem://features/ui/navigation-logic`:

| Widget | Source |
|---|---|
| Week-over-week strip | `dashboard-ai-insights` |
| KPI tiles (sessions, leads, conversion rate, ad spend) | `events` + `conversions_daily` |
| Funnel (Sessions → Leads, **excludes pageviews**) | per `mem://features/dashboard/funnel-logic` |
| Form Health (Healthy / Warning / Stalled) | baseline-aware classification |
| Click Activity (mailto, tel, CTA, outbound, anchor) | `events` filtered by intent |
| Needs Attention (SSL ≤5d, domain ≤30d, tracker stalled, form stalled, broken links) | composite query |
| Goal-aware reorder | priority shifts by `primary_focus` |

**Policy**: zero placeholder data. If a metric has no source, the widget renders an empty state — never a fake number.

---

## 6. Performance & Reports  *(key: `reporting`)*

- **Custom date ranges** synchronized across Performance, Dashboard widgets, and Reports via global selector.
- **Reports engine** uses canvas-based section capture to prevent chart/text drift in PDFs.
- **AI copy** via `reports-ai-copy` (cap: 15/mo per org).
- **Snapshots**: shareable links with token hash, time-limited expiry, anonymous access.

---

## 7. Monitoring suite  *(key: `monitoring`)*

Tabs: Overview, Form Checks, Broken Links, Domain & SSL, Plugin & WordPress, Notifications.

- **Active HTTP pinging**: HEAD with GET fallback, two-strike confirmation before flagging.
- **Domain/SSL queries** filter by `site_id` (not `org_id`) to survive org reassignment.
- **Plugin update check**: `plugin-update-check` edge function compares installed vs. `pluginManifest.version`.
- **Auto-sync on first heartbeat**: a brand-new site MUST get its first uptime ping, domain/SSL lookup, and plugin-version check within 10 minutes of registration. Without this, `/monitoring` would show empty cards on day 1 — that is a regression. Enforced by §19.
- **Continuous freshness contract**: every monitoring data point has a maximum staleness budget — uptime ≤ 5 min, tracker health ≤ 5 min, domain/SSL ≤ 24 h, broken-link scan ≤ 7 d. The `monitoring-freshness-watchdog` cron (every 30 min) flags any site that breaches its budget and re-enqueues the appropriate refresh job.

---

## 8. Security module  *(key: `security`)*

Requires plugin v1.4.0+. Real-time WordPress integrity events.

- **Aggregation**: same event type from same source within rolling window collapses to one badge.
- **Crash containment** (PRs 1–5, v1.10–1.14): Bootstrap → Module Registry → Logger → Mode state machine → BootCounter → Preflight. Plugin enters Safe Mode after N consecutive crashes.

---

## 9. SEO suite  *(key: `seo`)*

Tiered visibility: **No Insights Yet** → **Summary** → **Advanced**. New orgs default to `summary`. AI fix suggestions via `seo-suggest-fix` (cap: 10/mo).

- **Auto-baseline on first heartbeat**: a new site MUST be queued for an initial `seo-scan` within 10 minutes of registration so the SEO module never opens with "No Insights Yet" for an active site. Enforced by §19.
- **Periodic refresh**: `seo-scan` re-runs weekly per site (or on-demand from `/seo`). Stale baselines (>14 d) are surfaced with a "Refresh now" CTA.

---

## 10. Compliance & consent  *(key: `compliance`)*

- **Privacy First default**: new orgs set to EU/UK Strict.
- **Region detection**: dual-layer (server-side country header + IP fallback).
- **Built-in banner**: conflict-resistant loader; survives WP theme/plugin interference.
- **External CMP integration**: dedicated layer for Cookiebot, OneTrust, Complianz, etc.
- **Setup guide**: `/compliance-setup` — 5 steps.
- **Third-party boundary**: ACTV TRKR manages consent **for ACTV TRKR analytics only**. Documented, surfaced in UI.

---

## 11. Notifications & email  *(key: `notifications`)*

- **Central queue** for all comms (real-time leads, Daily Digest, Weekly Digest, alerts).
- **Org-scoped**: multi-tenant isolation enforced at the queue level.
- **Unsubscribe**: token-based, one-click, recorded in `email_unsubscribe_tokens`.
- **Send state**: throttled by `email_send_state` (TTL, batch size, retry-after).

---

## 12. Billing & subscription  *(key: `billing`)*

- **Cancel anytime**: two-option flow (cancel immediate / end of period) per `mem://features/billing/lifecycle-policy`.
- **Manage Billing portal** requires Stripe key with `Write` permission (per `mem://security/stripe-api-constraints`).
- **Exemptions**: site owner + system owner + named client-tier orgs bypass the subscription gate.
- **Recovery events** logged in `billing_recovery_events` for failed payment retries.

---

## 13. White-label & branding  *(key: `whitelabel`)*

- Available to all users globally.
- Customizable: primary/secondary colors, logo, app name, support email.
- Applied to dashboard, emails, plugin assets where applicable.

---

## 14. AI features  *(key: `ai`)*

- **Insights** (`dashboard-ai-insights`): cap 15/mo, cached on metrics hash.
- **Reports copy** (`reports-ai-copy`): cap 15/mo.
- **SEO fixes** (`seo-suggest-fix`): cap 10/mo.
- **Nova chatbot**: 300 msgs/mo per org, cached by query hash.
- **All AI endpoints require valid JWT** (no anonymous access).

---

## 15. Data retention & archives  *(key: `retention`)*

3-layer model:
- **Hot**: 12 months of detailed records.
- **Cold**: archived to storage, accessible via `/archives` UI.
- **Aggregate**: indefinite retention of daily rollups.

Retention overrides per plan tier in `consent_config.retention_months`.

---

## 16. Backend processes & crons  *(key: `backend`)*

- `check-tracking-health` — every 5 min
- `aggregate-daily` — nightly
- `process-email-queue` — every minute
- `check-site-status` — on-demand + nightly
- `archive-old-data` — weekly
- `plugin-update-check` — on-demand from plugin

---

## 17. Security boundaries  *(key: `security_boundaries`)*

- **RLS everywhere**: every public table has policies; org isolation enforced at the database layer.
- **API keys**: hashed at rest, one active key per org policy.
- **CORS allowlist**: `actvtrkr.com`, `mshnctrl.lovable.app`, project preview hosts only.
- **Ingestion hardening**: centralized middleware on every ingestion endpoint.
- **Read-only WP principle**: the platform never mutates the WordPress site.

---

## 18. Review checklist (manual QA)  *(key: `review_qa`)*

Before sign-off, the reviewing admin must spot-check:

1. Checkout → Auth → Onboarding flow completes end-to-end.
2. Plugin downloads and version matches `pluginManifest.version`.
3. New site auto-registers from a fresh WP install.
4. Tracker.js fires under both Strict and Relaxed consent modes.
5. Forms auto-discovered for at least one Gravity, one Avada, and one CF7 install.
6. Dashboard renders with real data and graceful empty states.
7. Email send queue processes a transactional email within 60s.
8. Stripe webhook for `invoice.payment_succeeded` updates `subscribers`.
9. White-label preview applies primary color across dashboard + emails.
10. RLS smoke test: a user from Org A cannot read Org B's `events`, `forms`, or `subscribers` rows.
11. **New-customer auto-sync**: from a brand-new install, within 10 min `/dashboard`, `/monitoring`, `/forms`, and `/seo` all show real data (or a documented "still syncing" state) — never blank.
12. **Email 2FA**: signing in requires entering a 6-digit code emailed to the user before a session is granted (verified end-to-end).
13. **Form Capture label**: landing page reads "Form Capture" (not "Universal Form Capture").
14. **Install integrity**: `verify-install` returns `overall: "pass"` for at least one freshly-connected test site (see §20).

---

## 19. Auto-sync contract  *(key: `autosync`)*

This section is the **single source of truth** for "things should not be empty for a paying customer." If any surface (Dashboard, Monitoring, Forms, SEO, Reports) is blank for a site that has reported a heartbeat, the cause MUST be one of the documented states below — never an unexplained gap.

### 19.1 First-touch sync (new sites)

When a site sends its **first** heartbeat (i.e., no prior row in `sites`, or `first_seen_at` is within the last 24 h), the platform fans out the following jobs within 10 minutes:

| # | Job | Purpose | Surface unblocked |
|---|-----|---------|-------------------|
| 1 | `provision-site` | Insert/normalize `sites` row | All |
| 2 | `check-site-status` | First uptime ping | `/monitoring` Overview |
| 3 | `check-tracking-health` | Tracker state Active/Warning/Inactive | Dashboard Needs Attention |
| 4 | `check-domain-ssl` | Domain + SSL expiry | `/monitoring` Domain & SSL |
| 5 | `manage-import-job?action=discover` | Populate `form_integrations`, auto-job non-empty forms | `/forms`, `/settings → Form Import` |
| 6 | `seo-scan` (initial) | Seed Summary baseline | `/seo` |
| 7 | `aggregate-daily` (today only) | Backfill today's KPI tiles | Dashboard |
| 8 | `send-transactional-email` (welcome) | Notify owner site is live | Inbox |

Orchestrated by the `new-site-bootstrap` edge function, triggered by the heartbeat ingestion endpoint when it detects a new site. Idempotent — safe to re-run.

### 19.2 Steady-state freshness budgets

Every long-lived data point has a maximum staleness budget. If exceeded with no active job, the relevant watchdog cron MUST re-enqueue the refresh:

| Data point | Budget | Watchdog | Recovery action |
|------------|--------|----------|-----------------|
| Uptime ping | 5 min | `check-tracking-health` (5 min) | Re-ping |
| Tracker health | 5 min | `check-tracking-health` (5 min) | Re-evaluate |
| Form drift (live count vs. imported) | 10 min | `form-import-watchdog` (10 min) | Insert pending job, kick `process-import-queue` |
| Domain/SSL | 24 h | `monitoring-freshness-watchdog` (30 min) | Re-run `check-domain-ssl` |
| Broken-link scan | 7 d | `monitoring-freshness-watchdog` (30 min) | Re-run scan |
| SEO baseline | 14 d | `seo-freshness-watchdog` (daily) | Re-run `seo-scan` |
| Plugin version | 24 h | `plugin-update-check` on demand | Compare to `pluginManifest.version` |
| Daily aggregates | 24 h | `aggregate-daily` (nightly) | Backfill missing day |

### 19.3 Admin observability

`/admin-setup → New Customer Health` (owner-only) lists every site < 7 days old and shows a green/red matrix for each of the 8 first-touch jobs. Any red cell exposes a "Re-run" button that re-invokes that single job for that single site.

`/admin-setup → Freshness Watchdog` shows the current count of sites breaching each staleness budget with one-click "Re-run watchdog now" actions.

### 19.4 Empty-state policy (UI contract)

A page MUST render one of these three states — never a silent blank:

1. **Real data** — the happy path.
2. **"Still syncing — first data in ~N minutes"** — only valid for sites < 24 h old. Renders a progress hint pointing to which auto-sync job is still pending.
3. **"No data — last sync failed"** — renders the timestamp of the failed job and a "Retry" CTA. Triggers an entry on the New Customer Health panel.

Any blank/whitespace render outside these three is a bug.

---

## 20. Install integrity (the "ghoulspodcast → bbbedu" lesson)  *(key: `install_integrity`)*

This section exists because of a specific class of bug: **an install silently succeeded but produced inconsistent state** — wrong org name, missing `form_integrations`, dashboard showed "nothing wrong" while the user saw nothing right.

The root cause was three failures stacking:
1. `create_org_with_admin` reused an old org for a new install (idempotency guard had no scope).
2. `ingest-heartbeat` post-install bootstrap threw a `ReferenceError` (undefined `domainHealth`) but was wrapped in a swallow-all `try/catch` logged as "non-fatal."
3. The `forms` ↔ `form_integrations` two-table model had no integrity check.

### 20.1 Invariants enforced on every heartbeat

The `ingest-heartbeat` function MUST:

- **Reconcile org name** (`reconcileOrgName`): if the org name does not match any of its sites' domains, rename to the oldest site's domain. Rules:
  - Skip if name matches some site domain (multi-site is fine).
  - Always rename if name is generic (`""`, `"My Organization"`, etc.).
  - Otherwise rename if name matches no site domain at all.
- **Surface bootstrap failures as structured ERROR logs** with `site_id`, `org_id`, `domain`, `error`, and `stack`. No `console.error("non-fatal:", e)` — those are forbidden.
- **Re-trigger discovery** when `forms` exist but `form_integrations` are missing.

### 20.2 Self-healing reconciler (every 15 min)

`reconcile-install-integrity` runs as a pg_cron job and:

1. Scans every `UP` site for forms-vs-integrations drift; triggers `trigger-site-sync` for any drift detected.
2. Scans every site for missing `domain_health` / `ssl_health`; triggers `check-domain-ssl`.
3. Scans every org for name mismatch; renames to oldest site's domain.

Returns a JSON report visible in edge function logs — auditable.

### 20.3 Post-install smoke test (`verify-install`)

User-callable edge function (org members only) that runs 8 deterministic checks for a given `org_id` (+ optional `site_id`):

1. Site is registered.
2. Org name matches at least one site domain.
3. Site has a heartbeat in the last 24 h.
4. Forms have been discovered (warn if 0).
5. Every active form has a matching `form_integration` (fail otherwise).
6. `domain_health` row exists.
7. `ssl_health` row exists.
8. Tracking pixel reported a pageview in the last 24 h.

Returns `overall: "pass" | "warn" | "fail"`. Surfaced in `/admin-setup` under "Install Verification" so any install drift is visible without digging through logs.

### 20.4 What is FORBIDDEN

- Catching errors and logging them as "non-fatal" without a structured ERROR log.
- Adding new two-table models (parent/child split) without a corresponding entry in §20.1's reconciler scan.
- Using `create_org_with_admin`'s idempotency reuse for any code path other than the original onboarding flow. New installs from any other entry point MUST pass `p_allow_existing := false`.
