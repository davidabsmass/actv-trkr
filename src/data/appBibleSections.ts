/**
 * App Bible — Section Catalog
 * Source of truth: docs/APP_BIBLE.md
 * Keys here MUST match the section keys in the markdown.
 */

export type AppBibleSection = {
  key: string;
  title: string;
  summary: string;
  bullets: string[];
};

export const APP_BIBLE_SECTIONS: AppBibleSection[] = [
  {
    key: "lifecycle",
    title: "1. Subscriber lifecycle",
    summary: "Checkout → Auth → Onboarding → Plugin install → Site verification → Active.",
    bullets: [
      "Stripe checkout via create-checkout edge function ($49/mo Multi-Site).",
      "Org + subscriber + consent_config + site_settings provisioned on first auth.",
      "Onboarding collects website count, customer type, primary focus.",
      "Plugin auto-registers site on first heartbeat — no manual URL entry.",
      "Failure recovery: manual org creation in /admin-setup; Re-scan Forms in /monitoring.",
    ],
  },
  {
    key: "auth",
    title: "2. Authentication & access",
    summary: "Sessions, roles, owner override, branded emails.",
    bullets: [
      "1-hour access token, 1-week refresh token.",
      "Roles in public.user_roles (NEVER on profiles).",
      "Owner email lands on /admin-setup with full access.",
      "Astronaut header reserved for signup confirmation + welcome only.",
    ],
  },
  {
    key: "tracking",
    title: "3. Tracking pipeline",
    summary: "tracker.js → ingestion endpoints → consent gate → health monitor.",
    bullets: [
      "Multi-layered transport: fetch → sendBeacon → image pixel.",
      "Domain normalization (strip www.) at registration AND every endpoint.",
      "Strict mode tracker is 100% inert until consent.",
      "check-tracking-health runs every 5 min (Active → Warning → Inactive).",
    ],
  },
  {
    key: "forms",
    title: "4. Forms ingestion",
    summary: "3-layer architecture across 6 form builders, with drift watchdog and spam quarantine.",
    bullets: [
      "Discovery → Background Backfill → Real-time webhook.",
      "Gravity, Avada/Fusion (strict authoritative), WPForms, CF7, Ninja, Fluent (v1.16.9+).",
      "Spam threshold: forms over 50k entries auto-quarantine as needs_review with a Force import override.",
      "form-import-watchdog (every 10 min) detects drift, releases stuck jobs, and heals cleaned-up forms.",
      "Admin observability: /admin-setup → Form Import Health surfaces drift and manual triggers.",
      "Field mapping editable per form in /forms; parsing logic finalized — no structural changes without approval.",
    ],
  },
  {
    key: "dashboard",
    title: "5. Dashboard surfaces",
    summary: "WoW strip, KPIs, funnel (sessions→leads, no pageviews), Form Health, Click Activity, Needs Attention.",
    bullets: [
      "Funnel excludes pageviews to keep conversion math accurate.",
      "Form Health classified by historical baseline.",
      "Needs Attention: SSL ≤5d, domain ≤30d, tracker stalled, form stalled, broken links.",
      "ZERO placeholder data — empty state instead of fake numbers.",
    ],
  },
  {
    key: "reporting",
    title: "6. Performance & Reports",
    summary: "Custom date ranges, canvas-based PDF capture, AI copy.",
    bullets: [
      "Global date range syncs Performance + Dashboard + Reports.",
      "PDFs use canvas-based section capture (no chart drift).",
      "reports-ai-copy capped at 15/mo per org.",
      "Snapshots: token-hashed, time-limited, anonymous-readable.",
    ],
  },
  {
    key: "monitoring",
    title: "7. Monitoring suite",
    summary: "Overview, Form Checks, Broken Links, Domain & SSL, Plugin & WP, Notifications.",
    bullets: [
      "Active HTTP pinging: HEAD with GET fallback, two-strike confirmation.",
      "Domain/SSL queries filter by site_id (not org_id) to survive org reassignment.",
      "Plugin update check compares installed vs pluginManifest.version.",
    ],
  },
  {
    key: "security",
    title: "8. Security module",
    summary: "Real-time WP integrity events (plugin v1.4.0+).",
    bullets: [
      "Aggregation collapses repeat events from same source within rolling window.",
      "Crash containment v1.10–1.14: Bootstrap, Module Registry, Logger, Mode SM, BootCounter, Preflight.",
      "Plugin enters Safe Mode after N consecutive crashes.",
    ],
  },
  {
    key: "seo",
    title: "9. SEO suite",
    summary: "Tiered visibility model + AI fix suggestions.",
    bullets: [
      "Visibility tiers: No Insights Yet → Summary → Advanced.",
      "New orgs default to Summary.",
      "seo-suggest-fix capped at 10/mo.",
    ],
  },
  {
    key: "compliance",
    title: "10. Compliance & consent",
    summary: "Privacy First default, region detection, built-in banner, external CMP support.",
    bullets: [
      "New orgs default to EU/UK Strict.",
      "Dual-layer region detection (server header + IP fallback).",
      "Built-in banner uses conflict-resistant loader.",
      "Third-party boundary: ACTV TRKR manages consent for ACTV TRKR analytics ONLY.",
    ],
  },
  {
    key: "notifications",
    title: "11. Notifications & email",
    summary: "Central queue, org-scoped, throttled.",
    bullets: [
      "Real-time leads, Daily Digest, Weekly Digest, alerts all share the queue.",
      "Multi-tenant isolation enforced at the queue layer.",
      "Token-based one-click unsubscribe.",
      "Send state throttled by TTL, batch size, retry-after.",
    ],
  },
  {
    key: "billing",
    title: "12. Billing & subscription",
    summary: "Cancel anytime, Stripe portal, exemptions, recovery events.",
    bullets: [
      "Cancel flow: cancel immediate OR end of period.",
      "Manage Billing portal needs Stripe key with Write permission.",
      "Owner + named client-tier orgs bypass the subscription gate.",
      "billing_recovery_events logs failed payment retries.",
    ],
  },
  {
    key: "whitelabel",
    title: "13. White-label & branding",
    summary: "Available globally to all users.",
    bullets: [
      "Customize: primary/secondary colors, logo, app name, support email.",
      "Applied across dashboard, emails, plugin assets.",
    ],
  },
  {
    key: "ai",
    title: "14. AI features",
    summary: "Insights, Reports copy, SEO fixes, Nova chatbot — all capped, all JWT-gated.",
    bullets: [
      "dashboard-ai-insights: 15/mo, cached on metrics hash.",
      "reports-ai-copy: 15/mo.",
      "seo-suggest-fix: 10/mo.",
      "Nova: 300 msgs/mo per org, query-hash cached.",
      "ALL AI endpoints require valid JWT.",
    ],
  },
  {
    key: "retention",
    title: "15. Data retention & archives",
    summary: "Hot (12mo) → Cold (archives) → Aggregate (indefinite).",
    bullets: [
      "/archives surfaces cold storage to admins.",
      "Per-plan retention overrides in consent_config.retention_months.",
    ],
  },
  {
    key: "backend",
    title: "16. Backend processes & crons",
    summary: "Scheduled edge functions keep the platform alive.",
    bullets: [
      "check-tracking-health: every 5 min.",
      "aggregate-daily: nightly.",
      "process-email-queue: every minute.",
      "check-site-status: on-demand + nightly.",
      "archive-old-data: weekly.",
    ],
  },
  {
    key: "security_boundaries",
    title: "17. Security boundaries",
    summary: "RLS, hashed API keys, CORS allowlist, hardened ingestion, read-only WP.",
    bullets: [
      "Every public table has RLS; org isolation enforced at DB layer.",
      "API keys hashed at rest; one active key per org.",
      "CORS: actvtrkr.com, mshnctrl.lovable.app, project preview hosts only.",
      "Centralized ingestion middleware on track-* and ingest-* endpoints.",
      "Platform NEVER mutates the WordPress site.",
    ],
  },
  {
    key: "review_qa",
    title: "18. Manual QA spot-checks",
    summary: "Before sign-off, the reviewing admin verifies these flows.",
    bullets: [
      "Checkout → Auth → Onboarding completes end-to-end.",
      "Plugin downloads; version matches pluginManifest.version.",
      "New WP install auto-registers a site.",
      "Tracker fires correctly under Strict and Relaxed consent.",
      "Forms auto-discovered for Gravity + Avada + CF7.",
      "Dashboard renders real data + graceful empty states.",
      "Email queue processes a transactional within 60s.",
      "Stripe invoice.payment_succeeded updates subscribers.",
      "White-label preview applies across dashboard + emails.",
      "RLS smoke test: Org A cannot read Org B's events/forms/subscribers.",
      "New customer auto-sync: within 10 min Dashboard, Monitoring, Forms, SEO all show data (or documented 'still syncing').",
      "Email 2FA: login requires a 6-digit code emailed to the user before a session is granted.",
      "Landing page label reads 'Form Capture' (not 'Universal Form Capture').",
    ],
  },
  {
    key: "autosync",
    title: "19. Auto-sync contract",
    summary:
      "Single source of truth for 'no surface should be empty for a paying customer.' First-touch fan-out + steady-state freshness budgets.",
    bullets: [
      "First heartbeat triggers new-site-bootstrap: provision-site, check-site-status, check-tracking-health, check-domain-ssl, manage-import-job?action=discover, seo-scan, aggregate-daily, welcome email — all within 10 min.",
      "Steady-state freshness budgets: uptime/tracker 5 min, form drift 10 min, domain/SSL 24 h, broken-link 7 d, SEO baseline 14 d, plugin version 24 h.",
      "Watchdogs re-enqueue on budget breach: form-import-watchdog (10 min), monitoring-freshness-watchdog (30 min), seo-freshness-watchdog (daily).",
      "/admin-setup → New Customer Health: green/red matrix per first-touch job for sites <7 days old, with one-click re-run.",
      "/admin-setup → Freshness Watchdog: counts of sites breaching each budget, manual re-run.",
      "Empty-state UI contract: every page renders one of {real data, 'still syncing — first data in ~N min', 'no data — last sync failed + Retry'}. Silent blanks are bugs.",
    ],
  },
];
