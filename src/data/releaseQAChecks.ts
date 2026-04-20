/**
 * Release QA — Check Registry
 *
 * Single source of truth for the launch checklist. Each check is atomic and
 * mapped to one of the 19 App Bible categories. The runner edge function
 * `run-release-qa` reads this same shape (via inline mirror) to execute checks.
 *
 * ⚠️ Keep `key`s STABLE — they are used as DB primary identifiers across runs
 * and persistent manual sign-offs.
 */

export type CheckCategoryKey =
  | "lifecycle"
  | "auth"
  | "tracking"
  | "forms"
  | "dashboard"
  | "reporting"
  | "monitoring"
  | "security"
  | "seo"
  | "compliance"
  | "notifications"
  | "billing"
  | "whitelabel"
  | "ai"
  | "retention"
  | "backend"
  | "security_boundaries"
  | "autosync"
  | "plugin"
  | "ci";

export type CheckType = "automated" | "manual" | "hybrid";
export type CheckSeverity = "critical" | "high" | "medium" | "low";

export type ReleaseQACheck = {
  key: string;
  category: CheckCategoryKey;
  title: string;
  description: string;
  type: CheckType;
  severity: CheckSeverity;
  expectedResult: string;
  /** Hint shown to a human before they sign off a manual/hybrid check. */
  manualSteps?: string[];
};

export const RELEASE_QA_CATEGORY_LABEL: Record<CheckCategoryKey, string> = {
  lifecycle: "1. Subscriber lifecycle",
  auth: "2. Authentication & access",
  tracking: "3. Tracking pipeline",
  forms: "4. Forms ingestion",
  dashboard: "5. Dashboard surfaces",
  reporting: "6. Performance & Reports",
  monitoring: "7. Monitoring suite",
  security: "8. Security module",
  seo: "9. SEO suite",
  compliance: "10. Compliance & consent",
  notifications: "11. Notifications & email",
  billing: "12. Billing & subscription",
  whitelabel: "13. White-label",
  ai: "14. AI features",
  retention: "15. Retention & archives",
  backend: "16. Backend crons",
  security_boundaries: "17. Security boundaries",
  autosync: "19. Auto-sync contract",
  plugin: "20. Plugin artifact",
  ci: "21. CI / pipeline",
};

export const RELEASE_QA_CHECKS: ReleaseQACheck[] = [
  // ───────────────────────────── LIFECYCLE ─────────────────────────────
  {
    key: "lifecycle.create_checkout_deployed",
    category: "lifecycle",
    title: "create-checkout edge function deployed",
    description:
      "The Stripe checkout entry point must be reachable. Runner pings the function and asserts a non-5xx response.",
    type: "automated",
    severity: "critical",
    expectedResult: "HTTP < 500 from create-checkout function",
  },
  {
    key: "lifecycle.org_provisioning_rpc",
    category: "lifecycle",
    title: "create_org_with_admin RPC exists",
    description:
      "Org + admin provisioning RPC is the contract relied on by Onboarding. Runner queries pg_proc.",
    type: "automated",
    severity: "critical",
    expectedResult: "Function present in public schema",
  },
  {
    key: "lifecycle.recent_signup_health",
    category: "lifecycle",
    title: "Recent signups have org + subscriber + consent",
    description:
      "For each org created in the last 30 days, verify it has a matching subscriber + consent_config row. Missing rows indicate broken provisioning.",
    type: "automated",
    severity: "high",
    expectedResult: "Every recent org has subscriber + consent_config",
  },
  {
    key: "lifecycle.checkout_to_active_manual",
    category: "lifecycle",
    title: "Checkout → Auth → Onboarding → Active (E2E)",
    description:
      "Run the full paid signup flow end-to-end with a real Stripe test card and confirm a new active org appears.",
    type: "hybrid",
    severity: "critical",
    expectedResult: "New org reaches status='active' within 5 minutes",
    manualSteps: [
      "Open /checkout in incognito; complete with Stripe test card 4242 4242 4242 4242",
      "Complete signup confirmation email + auth",
      "Complete /onboarding form",
      "Confirm new org appears in /admin-setup → Subscriber Sites with status=active",
      "EVIDENCE REQUIRED in notes: (a) new org name, (b) Stripe customer id (cus_…), (c) timestamp signup completed",
    ],
  },

  // ───────────────────────────── TRACKING ─────────────────────────────
  {
    key: "tracking.health_cron_recent",
    category: "tracking",
    title: "check-tracking-health ran in last 10 min",
    description:
      "Tracker health monitor must run on its 5-min cadence. Runner inspects sites.tracker_last_checked_at MAX().",
    type: "automated",
    severity: "high",
    expectedResult: "MAX(tracker_last_checked_at) within last 600s",
  },
  {
    key: "tracking.recent_pageviews_exist",
    category: "tracking",
    title: "Pageviews ingested in last hour",
    description:
      "Aggregate ingest signal — at least one pageview landed across all active orgs in the past hour. Indicates tracker.js + ingest pipeline alive.",
    type: "automated",
    severity: "critical",
    expectedResult: "≥1 pageview in last 60 min (skipped if no active orgs)",
  },
  {
    key: "tracking.sites_active_majority",
    category: "tracking",
    title: "≥80% of sites tracker status = active",
    description:
      "Among sites tracked in the past 7 days, at least 80% should be in active state (vs warning/inactive). Below that suggests a regression.",
    type: "automated",
    severity: "high",
    expectedResult: "active_pct ≥ 80% of recently-seen sites",
  },
  {
    key: "tracking.consent_strict_inert_manual",
    category: "tracking",
    title: "Strict-mode tracker is inert before consent",
    description:
      "Verify on a strict-mode test site that no pageview/event hits the network until consent granted.",
    type: "manual",
    severity: "critical",
    expectedResult: "Zero ingest requests fire before user clicks Accept",
    manualSteps: [
      "Open a strict-mode test site in DevTools → Network",
      "Filter for 'track-pageview' and 'track-event'",
      "Reload — confirm zero requests fire before consent banner click",
      "Click Accept — confirm requests start flowing",
      "EVIDENCE REQUIRED in notes: (a) test site URL, (b) screenshot link of empty network panel pre-consent, (c) screenshot link of requests post-consent",
    ],
  },

  // ───────────────────────────── FORMS ─────────────────────────────
  {
    key: "forms.import_watchdog_recent",
    category: "forms",
    title: "form-import-watchdog ran in last 30 min",
    description:
      "Drift detection cron must be alive. Inferred from the most recent form_jobs row updated by the watchdog.",
    type: "automated",
    severity: "high",
    expectedResult: "Watchdog activity within last 30 min OR no jobs to process",
  },
  {
    key: "forms.no_stuck_jobs",
    category: "forms",
    title: "No form import jobs stuck >2h in 'running'",
    description:
      "form_jobs rows in status='running' older than 2h indicate stalled background work.",
    type: "automated",
    severity: "high",
    expectedResult: "0 stuck jobs",
  },
  {
    key: "forms.recent_form_entries",
    category: "forms",
    title: "Form entries received in last 7 days",
    description:
      "End-to-end signal that at least one form across the platform delivered an entry through the ingestion pipeline recently.",
    type: "automated",
    severity: "medium",
    expectedResult: "≥1 form_entries row in last 7 days",
  },
  {
    key: "forms.gravity_avada_cf7_manual",
    category: "forms",
    title: "Gravity + Avada + CF7 forms auto-discovered",
    description:
      "Hands-on QA: a freshly connected WP site with these 3 builders should auto-populate /forms with discovered forms.",
    type: "manual",
    severity: "high",
    expectedResult: "All 3 builder types appear in /forms within 10 minutes of plugin connect",
    manualSteps: [
      "Connect plugin on test WP site that has Gravity Forms + Avada/Fusion + CF7 installed",
      "Wait 10 minutes",
      "Open /forms — confirm forms from all 3 builders are listed",
      "EVIDENCE REQUIRED in notes: (a) site URL, (b) form count per builder (e.g. 'Gravity: 2, Avada: 1, CF7: 1'), (c) screenshot link of /forms page",
    ],
  },

  // ───────────────────────────── BILLING ─────────────────────────────
  {
    key: "billing.stripe_secret_present",
    category: "billing",
    title: "STRIPE_SECRET_KEY configured",
    description: "Stripe API key must be present as an edge function secret.",
    type: "automated",
    severity: "critical",
    expectedResult: "Secret exists",
  },
  {
    key: "billing.webhook_signature_recent",
    category: "billing",
    title: "Stripe webhook signature verified in last 7d",
    description:
      "webhook_verification_log must show at least one successful Stripe verification recently — confirms the live webhook secret matches.",
    type: "automated",
    severity: "critical",
    expectedResult: "≥1 verified Stripe webhook in last 7 days",
  },
  {
    key: "billing.no_signature_failures",
    category: "billing",
    title: "No webhook signature failures in last 24h",
    description:
      "verification_status IN ('signature_invalid','replay_rejected') count over the last 24h must be 0 (or low).",
    type: "automated",
    severity: "high",
    expectedResult: "0 invalid signatures in last 24h",
  },
  {
    key: "billing.recovery_events_recent",
    category: "billing",
    title: "billing_recovery_events table receiving data",
    description:
      "If the Stripe → recovery pipeline has been silent for >30 days, either nothing happened (OK) or the integration broke. Reported as warn for review.",
    type: "automated",
    severity: "low",
    expectedResult: "Reviewed (warn-only signal)",
  },
  {
    key: "billing.cancel_flow_manual",
    category: "billing",
    title: "Cancel + reactivate flow works end-to-end",
    description:
      "Run cancel-anytime flow and confirm subscription transitions correctly; then reactivate via smart-reactivate.",
    type: "manual",
    severity: "high",
    expectedResult: "Org reaches grace_period on cancel, reactivates cleanly",
    manualSteps: [
      "Cancel a test sub via Account → Cancel",
      "Confirm org status = grace_period in /admin-setup",
      "Click Reactivate banner CTA — confirm Stripe portal opens or fresh checkout",
      "Complete reactivation; confirm org status = active",
      "EVIDENCE REQUIRED in notes: (a) test org id, (b) Stripe sub id (sub_…), (c) timestamps of cancel + reactivate events",
    ],
  },
  {
    key: "billing.portal_manual",
    category: "billing",
    title: "Stripe customer portal opens",
    description:
      "Account page → Manage Billing must open Stripe portal. Requires Stripe key with Write permission.",
    type: "manual",
    severity: "medium",
    expectedResult: "Portal opens in new tab without 4xx",
    manualSteps: [
      "Sign in as a paying test user",
      "Open /account → Manage Billing",
      "Confirm Stripe portal loads",
      "EVIDENCE REQUIRED in notes: (a) test user email, (b) portal URL prefix shown (billing.stripe.com/p/session/…), (c) HTTP status from network panel",
    ],
  },

  // ───────────────────────── SECURITY BOUNDARIES ─────────────────────────
  {
    key: "security_boundaries.rls_enabled_all_tables",
    category: "security_boundaries",
    title: "RLS enabled on every public table",
    description:
      "Queries pg_tables for any public table where rowsecurity=false. Must be empty.",
    type: "automated",
    severity: "critical",
    expectedResult: "0 public tables with RLS disabled",
  },
  {
    key: "security_boundaries.has_role_function",
    category: "security_boundaries",
    title: "has_role() security-definer function present",
    description: "Roles must be checked via has_role(); function must exist as SECURITY DEFINER.",
    type: "automated",
    severity: "critical",
    expectedResult: "has_role function exists and is SECURITY DEFINER",
  },
  {
    key: "security_boundaries.no_critical_findings",
    category: "security_boundaries",
    title: "No critical open security findings",
    description:
      "security_findings WHERE status='open' AND severity='critical' must be 0.",
    type: "automated",
    severity: "critical",
    expectedResult: "0 open critical findings",
  },
  {
    key: "security_boundaries.api_keys_hashed",
    category: "security_boundaries",
    title: "API keys stored hashed (key_hash column populated)",
    description:
      "Every active api_keys row must have key_hash NOT NULL — plain keys must never be stored.",
    type: "automated",
    severity: "critical",
    expectedResult: "0 active api_keys with NULL key_hash",
  },
  {
    key: "security_boundaries.rls_smoke_test_manual",
    category: "security_boundaries",
    title: "RLS smoke test: Org A can't read Org B",
    description:
      "Hands-on multi-tenant isolation check.",
    type: "manual",
    severity: "critical",
    expectedResult: "Org A session sees zero rows from Org B's events/forms/subscribers",
    manualSteps: [
      "Sign in as a user in Org A",
      "Open Network tab; load /dashboard, /forms, /performance",
      "Inspect responses: no rows referencing Org B's id, sites, or emails",
      "Repeat for /entries (form leads)",
      "EVIDENCE REQUIRED in notes: (a) Org A id, (b) Org B id used for comparison, (c) sample of 1 response payload confirming only Org A data, (d) tester email",
    ],
  },

  // ───────────────────────────── AUTOSYNC ─────────────────────────────
  {
    key: "autosync.recent_org_first_data",
    category: "autosync",
    title: "Recent (<7d) orgs received first data",
    description:
      "For orgs created in the last 7 days, retention_events with event_name='first_data_received' should exist. Orgs without it after 24h indicate broken auto-sync.",
    type: "automated",
    severity: "high",
    expectedResult: "All <7d orgs >24h old have first_data_received",
  },
  {
    key: "autosync.aggregate_daily_recent",
    category: "autosync",
    title: "aggregate-daily ran in last 36h",
    description:
      "Nightly aggregation must be fresh. Inferred from MAX(day) in conversions_daily.",
    type: "automated",
    severity: "high",
    expectedResult: "MAX(day) ≥ today - 1",
  },
  {
    key: "autosync.email_queue_processing",
    category: "autosync",
    title: "Email queue processing within budget",
    description:
      "process-email-queue should drain the queue. Stale queued messages >5 min indicate processor down.",
    type: "automated",
    severity: "high",
    expectedResult: "0 messages older than 5 min in queue (or queue empty)",
  },

  // ───────────────────────────── AUTH ─────────────────────────────
  {
    key: "auth.user_roles_table_exists",
    category: "auth",
    title: "user_roles table exists with RLS",
    description:
      "Roles must live in dedicated table (never on profiles). Verify table + RLS.",
    type: "automated",
    severity: "critical",
    expectedResult: "Table exists, RLS enabled",
  },
  {
    key: "auth.profiles_no_role_column",
    category: "auth",
    title: "profiles table has NO role column",
    description:
      "Privilege escalation guard — role must not be stored on profiles.",
    type: "automated",
    severity: "critical",
    expectedResult: "No 'role' column on public.profiles",
  },
  {
    key: "auth.email_2fa_manual",
    category: "auth",
    title: "Email 2FA blocks login until code verified",
    description:
      "Sign in flow must require the 6-digit emailed code before granting a session.",
    type: "manual",
    severity: "high",
    expectedResult: "Session NOT granted until code verified",
    manualSteps: [
      "Sign in with email/password",
      "Confirm session is NOT active until /mfa-verify-code accepted the code",
      "Confirm dashboard inaccessible during pending state",
    ],
  },

  // ───────────────────────────── DASHBOARD ─────────────────────────────
  {
    key: "dashboard.no_placeholder_data",
    category: "dashboard",
    title: "Dashboard shows real data or empty state (manual)",
    description: "Spot-check the dashboard for placeholder/fake numbers.",
    type: "manual",
    severity: "high",
    expectedResult: "Every widget shows real data OR a documented empty state",
    manualSteps: [
      "Open /dashboard for a brand-new org (zero data)",
      "Confirm widgets show 'No data yet' style empty states, no fake numbers",
      "Open /dashboard for an active org — confirm numbers match /performance",
    ],
  },

  // ───────────────────────────── REPORTING ─────────────────────────────
  {
    key: "reporting.snapshot_storage_ready",
    category: "reporting",
    title: "Reports storage bucket exists",
    description: "PDF/snapshot exports require the 'reports' storage bucket.",
    type: "automated",
    severity: "high",
    expectedResult: "Bucket 'reports' exists",
  },
  {
    key: "reporting.snapshot_pdf_manual",
    category: "reporting",
    title: "Generate + download a snapshot PDF",
    description: "End-to-end report generation works.",
    type: "manual",
    severity: "medium",
    expectedResult: "PDF downloads with correct charts (no drift) and metric values",
    manualSteps: [
      "Open /reports for an org with data",
      "Generate a PDF snapshot",
      "Confirm download succeeds and charts match dashboard",
    ],
  },

  // ───────────────────────────── MONITORING ─────────────────────────────
  {
    key: "monitoring.domain_ssl_recent",
    category: "monitoring",
    title: "Domain/SSL data refreshed in last 48h",
    description: "domain_health.last_checked_at MAX must be within 48h.",
    type: "automated",
    severity: "medium",
    expectedResult: "MAX(last_checked_at) ≤ 48h ago (or no domains tracked)",
  },

  // ───────────────────────────── SECURITY MODULE ─────────────────────────────
  {
    key: "security.findings_pipeline_alive",
    category: "security",
    title: "security_findings pipeline alive",
    description:
      "security-auto-generate-findings should produce findings rows over time. Warn if 0 findings in last 30d AND any orgs >7d old.",
    type: "automated",
    severity: "low",
    expectedResult: "Findings pipeline producing rows OR documented quiet period",
  },

  // ───────────────────────────── SEO ─────────────────────────────
  {
    key: "seo.suggest_function_deployed",
    category: "seo",
    title: "seo-suggest-fix function reachable",
    description: "AI SEO endpoint deployed and behind JWT.",
    type: "automated",
    severity: "medium",
    expectedResult: "Function returns 401/403 unauthenticated (proves JWT gate)",
  },

  // ───────────────────────────── COMPLIANCE ─────────────────────────────
  {
    key: "compliance.consent_default_strict",
    category: "compliance",
    title: "New orgs default to EU/UK Strict consent",
    description:
      "Inspect last 5 consent_config rows; consent_mode should be 'strict' for new orgs.",
    type: "automated",
    severity: "high",
    expectedResult: "Recent consent_config rows default to strict",
  },

  // ───────────────────────────── NOTIFICATIONS ─────────────────────────────
  {
    key: "notifications.email_send_log_recent",
    category: "notifications",
    title: "Transactional email sent in last 7 days",
    description:
      "email_send_log must have at least one 'sent' status entry recently.",
    type: "automated",
    severity: "high",
    expectedResult: "≥1 sent email in last 7 days",
  },
  {
    key: "notifications.unsubscribe_token_manual",
    category: "notifications",
    title: "One-click unsubscribe link works",
    description: "Token-based unsubscribe from a real email must succeed.",
    type: "manual",
    severity: "medium",
    expectedResult: "Unsubscribe page loads and confirms suppression",
    manualSteps: [
      "Open the most recent transactional email in your inbox",
      "Click the unsubscribe link",
      "Confirm /unsubscribe shows success and email is suppressed",
    ],
  },

  // ───────────────────────────── WHITE-LABEL ─────────────────────────────
  {
    key: "whitelabel.preview_manual",
    category: "whitelabel",
    title: "White-label branding applies across dashboard + email",
    description: "Custom colors/logo render correctly.",
    type: "manual",
    severity: "low",
    expectedResult: "Branding visible in dashboard header + transactional email preview",
    manualSteps: [
      "Open /settings → White Label, set custom primary color + logo",
      "Confirm dashboard header reflects new branding",
      "Open /admin-setup → preview-transactional-email — confirm branding applied",
    ],
  },

  // ───────────────────────────── AI ─────────────────────────────
  {
    key: "ai.endpoints_jwt_gated",
    category: "ai",
    title: "AI endpoints require JWT",
    description:
      "Anonymous calls to dashboard-ai-insights / reports-ai-copy / seo-suggest-fix / ai-chatbot must return 401.",
    type: "automated",
    severity: "critical",
    expectedResult: "All 4 endpoints reject unauthenticated requests",
  },

  // ───────────────────────────── RETENTION ─────────────────────────────
  {
    key: "retention.archive_bucket_exists",
    category: "retention",
    title: "archives storage bucket exists",
    description: "Cold storage destination for archived data.",
    type: "automated",
    severity: "medium",
    expectedResult: "Bucket 'archives' exists",
  },

  // ───────────────────────────── BACKEND CRONS ─────────────────────────────
  {
    key: "backend.critical_crons_scheduled",
    category: "backend",
    title: "Critical cron jobs scheduled",
    description:
      "cron.job must contain entries for: nightly-summary, compute-acquisition-metrics-nightly, retention-flow-dispatcher (or equivalents).",
    type: "automated",
    severity: "high",
    expectedResult: "All required jobs present in cron.job",
  },

  // ───────────────────────────── PLUGIN ─────────────────────────────
  {
    key: "plugin.manifest_version_target",
    category: "plugin",
    title: "Plugin manifest version matches release target",
    description:
      "pluginManifest.version is provided by client; runner echoes it back so the run is anchored to the right version.",
    type: "automated",
    severity: "critical",
    expectedResult: "Version is non-empty and matches the run's app_version",
  },
  {
    key: "plugin.zip_serves",
    category: "plugin",
    title: "serve-plugin-zip returns the plugin file",
    description:
      "Endpoint must serve the latest zip without 4xx/5xx (HEAD check).",
    type: "automated",
    severity: "critical",
    expectedResult: "HTTP 200 with non-zero content-length",
  },
  {
    key: "plugin.install_manual",
    category: "plugin",
    title: "Fresh plugin install on WordPress works",
    description:
      "Download the zip, install on a clean WP site, confirm site auto-registers.",
    type: "manual",
    severity: "critical",
    expectedResult: "Site appears in /admin-setup → Subscriber Sites within 10 min",
    manualSteps: [
      "Download plugin from /settings → Plugin",
      "Install + activate on a clean WP test site",
      "Paste API key from /settings",
      "Wait up to 10 min; confirm site auto-registers",
      "Paste site URL + org name in notes",
    ],
  },

  // ───────────────────────────── CI ─────────────────────────────
  {
    key: "ci.app_bible_signoff_complete",
    category: "ci",
    title: "All App Bible sections signed off for this version",
    description:
      "Confirms /admin-setup → App Bible review is fully checked for the current pluginManifest.version.",
    type: "automated",
    severity: "high",
    expectedResult: "19 / 19 sections signed off for current version",
  },
];

export const releaseQAByCategory = (): Record<CheckCategoryKey, ReleaseQACheck[]> => {
  const out = {} as Record<CheckCategoryKey, ReleaseQACheck[]>;
  for (const c of RELEASE_QA_CHECKS) {
    if (!out[c.category]) out[c.category] = [];
    out[c.category].push(c);
  }
  return out;
};
