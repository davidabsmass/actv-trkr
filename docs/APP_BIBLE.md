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
- **Active state** — Site appears in dashboard, monitoring, and reports surfaces.

**Failure recovery**:
- Stripe webhook missed → Owner can manually create the org via `/admin-setup → Clients`.
- Plugin never reports → "Re-scan Forms" button on `/settings → Form Import` calls `manage-import-job?action=discover` (see §4 for fallback behavior).

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
- **Supported builders**: Gravity Forms (strict authoritative), Avada/Fusion (post type `fusion_form`, strict authoritative), WPForms, Contact Form 7, Ninja Forms.
- **Field mapping**: canonical attributes (`name`, `email`, `phone`, `company`, `message`) editable per form in `/forms → Field Mapping`.
- **Stability lock**: per `mem://data/form-parsing-stability`, parsing logic is finalized. No structural changes without explicit approval.

### Two-table model

The forms pipeline maintains two distinct tables. They are NOT interchangeable:

| Table | Populated by | Read by |
|---|---|---|
| `forms` | `trigger-site-sync`, real-time webhook, tracker auto-discovery | Dashboard widgets, `/forms` page, conversion analytics |
| `form_integrations` | `manage-import-job?action=discover` only | `/settings → Form Import` panel (the re-scan UI) |

If `forms` has rows but `form_integrations` is empty, the Settings UI will show "0 forms" even though forms exist elsewhere in the app. The fix is to run discover (next section).

### Re-scan / discovery flow

The "Re-scan Forms" button in `/settings → Form Import` calls `manage-import-job?action=discover`. The function uses a two-step strategy:

1. **Primary**: POST to the WP plugin's `/actv-trkr/v1/import-discover` endpoint (60s timeout). On success, upserts results into `form_integrations`.
2. **Fallback** (when WP plugin times out, returns 5xx, or returns 0 forms): backfill `form_integrations` from any non-archived rows already present in the `forms` table for that site.

The fallback guarantees the Settings UI never displays "0 forms" when forms already exist in the database. The response includes `source: "wp_plugin" | "forms_table"` and `wp_plugin_error` so the UI can surface why the fallback path was taken.

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

---

## 8. Security module  *(key: `security`)*

Requires plugin v1.4.0+. Real-time WordPress integrity events.

- **Aggregation**: same event type from same source within rolling window collapses to one badge.
- **Crash containment** (PRs 1–5, v1.10–1.14): Bootstrap → Module Registry → Logger → Mode state machine → BootCounter → Preflight. Plugin enters Safe Mode after N consecutive crashes.

---

## 9. SEO suite  *(key: `seo`)*

Tiered visibility: **No Insights Yet** → **Summary** → **Advanced**. New orgs default to `summary`. AI fix suggestions via `seo-suggest-fix` (cap: 10/mo).

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
