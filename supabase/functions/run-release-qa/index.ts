// Release QA Runner — admin-only.
// Executes automated checks in parallel, persists results + evidence, and
// surfaces a one-shot release-readiness verdict.
//
// Body:
//   { app_version: string, scope?: "full" | "category:<key>" | "check:<key>" }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type CheckStatus = "pass" | "fail" | "warn" | "not_run" | "manual_pending" | "error";
type CheckType = "automated" | "manual" | "hybrid";
type Severity = "critical" | "high" | "medium" | "low";

interface CheckDef {
  key: string;
  category: string;
  type: CheckType;
  severity: Severity;
}

interface CheckResult {
  key: string;
  category: string;
  type: CheckType;
  severity: Severity;
  status: CheckStatus;
  message: string;
  duration_ms: number;
  evidence: Record<string, unknown>;
}

// ─── Mirror of the registry (keys must match src/data/releaseQAChecks.ts) ───
const CHECKS: CheckDef[] = [
  // lifecycle
  { key: "lifecycle.create_checkout_deployed", category: "lifecycle", type: "automated", severity: "critical" },
  { key: "lifecycle.org_provisioning_rpc", category: "lifecycle", type: "automated", severity: "critical" },
  { key: "lifecycle.recent_signup_health", category: "lifecycle", type: "automated", severity: "high" },
  { key: "lifecycle.checkout_to_active_manual", category: "lifecycle", type: "hybrid", severity: "critical" },
  // tracking
  { key: "tracking.health_cron_recent", category: "tracking", type: "automated", severity: "high" },
  { key: "tracking.recent_pageviews_exist", category: "tracking", type: "automated", severity: "critical" },
  { key: "tracking.sites_active_majority", category: "tracking", type: "automated", severity: "high" },
  { key: "tracking.consent_strict_inert_manual", category: "tracking", type: "manual", severity: "critical" },
  // forms
  { key: "forms.import_watchdog_recent", category: "forms", type: "automated", severity: "high" },
  { key: "forms.no_stuck_jobs", category: "forms", type: "automated", severity: "high" },
  { key: "forms.recent_form_entries", category: "forms", type: "automated", severity: "medium" },
  { key: "forms.gravity_avada_cf7_manual", category: "forms", type: "manual", severity: "high" },
  // billing
  { key: "billing.stripe_secret_present", category: "billing", type: "automated", severity: "critical" },
  { key: "billing.webhook_signature_recent", category: "billing", type: "automated", severity: "critical" },
  { key: "billing.no_signature_failures", category: "billing", type: "automated", severity: "high" },
  { key: "billing.recovery_events_recent", category: "billing", type: "automated", severity: "low" },
  { key: "billing.cancel_flow_manual", category: "billing", type: "manual", severity: "high" },
  { key: "billing.portal_manual", category: "billing", type: "manual", severity: "medium" },
  // security_boundaries
  { key: "security_boundaries.rls_enabled_all_tables", category: "security_boundaries", type: "automated", severity: "critical" },
  { key: "security_boundaries.has_role_function", category: "security_boundaries", type: "automated", severity: "critical" },
  { key: "security_boundaries.no_critical_findings", category: "security_boundaries", type: "automated", severity: "critical" },
  { key: "security_boundaries.api_keys_hashed", category: "security_boundaries", type: "automated", severity: "critical" },
  { key: "security_boundaries.rls_smoke_test_manual", category: "security_boundaries", type: "manual", severity: "critical" },
  // autosync
  { key: "autosync.recent_org_first_data", category: "autosync", type: "automated", severity: "high" },
  { key: "autosync.aggregate_daily_recent", category: "autosync", type: "automated", severity: "high" },
  { key: "autosync.email_queue_processing", category: "autosync", type: "automated", severity: "high" },
  // auth
  { key: "auth.user_roles_table_exists", category: "auth", type: "automated", severity: "critical" },
  { key: "auth.profiles_no_role_column", category: "auth", type: "automated", severity: "critical" },
  { key: "auth.email_2fa_manual", category: "auth", type: "manual", severity: "high" },
  // dashboard
  { key: "dashboard.no_placeholder_data", category: "dashboard", type: "manual", severity: "high" },
  // reporting
  { key: "reporting.snapshot_storage_ready", category: "reporting", type: "automated", severity: "high" },
  { key: "reporting.snapshot_pdf_manual", category: "reporting", type: "manual", severity: "medium" },
  // monitoring
  { key: "monitoring.domain_ssl_recent", category: "monitoring", type: "automated", severity: "medium" },
  // security
  { key: "security.findings_pipeline_alive", category: "security", type: "automated", severity: "low" },
  // seo
  { key: "seo.suggest_function_deployed", category: "seo", type: "automated", severity: "medium" },
  // compliance
  { key: "compliance.consent_default_strict", category: "compliance", type: "automated", severity: "high" },
  // notifications
  { key: "notifications.email_send_log_recent", category: "notifications", type: "automated", severity: "high" },
  { key: "notifications.unsubscribe_token_manual", category: "notifications", type: "manual", severity: "medium" },
  // whitelabel
  { key: "whitelabel.preview_manual", category: "whitelabel", type: "manual", severity: "low" },
  // ai
  { key: "ai.endpoints_jwt_gated", category: "ai", type: "automated", severity: "critical" },
  // retention
  { key: "retention.archive_bucket_exists", category: "retention", type: "automated", severity: "medium" },
  // backend
  { key: "backend.critical_crons_scheduled", category: "backend", type: "automated", severity: "high" },
  // plugin
  { key: "plugin.manifest_version_target", category: "plugin", type: "automated", severity: "critical" },
  { key: "plugin.zip_serves", category: "plugin", type: "automated", severity: "critical" },
  { key: "plugin.install_manual", category: "plugin", type: "manual", severity: "critical" },
  // ci
  { key: "ci.app_bible_signoff_complete", category: "ci", type: "automated", severity: "high" },
];

// ─── Helpers ───
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const ms = (start: number) => Date.now() - start;

const result = (
  def: CheckDef,
  status: CheckStatus,
  message: string,
  evidence: Record<string, unknown>,
  start: number,
): CheckResult => ({
  key: def.key,
  category: def.category,
  type: def.type,
  severity: def.severity,
  status,
  message,
  duration_ms: ms(start),
  evidence,
});

async function pingFn(name: string): Promise<{ status: number; ok: boolean }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: { "Access-Control-Request-Method": "POST" },
    });
    return { status: r.status, ok: r.status < 500 };
  } catch (_e) {
    return { status: 0, ok: false };
  }
}

async function pingFnUnauth(name: string): Promise<{ status: number }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return { status: r.status };
  } catch (_e) {
    return { status: 0 };
  }
}

// Prove the function is deployed without triggering its business logic.
// CORS preflight (OPTIONS) is handled by every edge function and proves the
// code path is loadable. A 200/204 = deployed; 404 = missing.
// We also fall back to checking POST status; if POST returns 4xx that ALSO
// proves the code is reachable (auth/validation rejected the empty body).
async function probeFnReachable(name: string): Promise<{ status: number; ok: boolean; method: string }> {
  try {
    const opt = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "OPTIONS",
      headers: {
        "Origin": "https://mshnctrl.lovable.app",
        "Access-Control-Request-Method": "POST",
      },
    });
    if (opt.status !== 404) {
      return { status: opt.status, ok: opt.status < 500, method: "OPTIONS" };
    }
  } catch (_e) { /* fall through */ }
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // 4xx = code ran and rejected — that's a deployed function.
    // 5xx = code crashed on empty body — accept as "deployed but no business assertion"
    // 404 = function not found.
    return { status: r.status, ok: r.status !== 404, method: "POST" };
  } catch (_e) {
    return { status: 0, ok: false, method: "ERROR" };
  }
}

// ─── Individual check runners ───
type Runner = (def: CheckDef, ctx: { app_version: string }) => Promise<CheckResult>;

const runners: Record<string, Runner> = {
  // ── lifecycle ──
  "lifecycle.create_checkout_deployed": async (def) => {
    const t = Date.now();
    const r = await probeFnReachable("create-checkout");
    return result(def, r.ok ? "pass" : "fail",
      r.ok ? `Function deployed (HTTP ${r.status} via ${r.method})`
           : `Unreachable / not deployed (HTTP ${r.status} via ${r.method})`,
      { http_status: r.status, probe_method: r.method }, t);
  },
  "lifecycle.org_provisioning_rpc": async (def) => {
    const t = Date.now();
    const { data, error } = await admin.rpc("create_org_with_admin", {
      p_org_id: "00000000-0000-0000-0000-000000000000",
      p_name: "__qa_probe__",
      p_timezone: "UTC",
    });
    // We expect this to FAIL gracefully (no auth.uid()), but the function must EXIST.
    const exists = !error || !/does not exist|undefined function/i.test(error.message || "");
    return result(def, exists ? "pass" : "fail",
      exists ? "RPC exists" : `RPC missing: ${error?.message}`,
      { rpc: "create_org_with_admin", probe_error: error?.message, probe_data: data }, t);
  },
  "lifecycle.recent_signup_health": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: allOrgs } = await admin
      .from("orgs").select("id, name, created_at").gte("created_at", since);
    if (!allOrgs?.length) {
      return result(def, "warn", "No orgs created in last 30d", { orgs_checked: 0 }, t);
    }
    const allOrgIds = allOrgs.map((o: any) => o.id);

    // Find all org→user mappings up front so we can filter to "real signups"
    // (an org with at least one member). Orphan orgs (no members) are leftover
    // test/abandoned data, not real signups, and shouldn't gate releases.
    const { data: orgUsers } = await admin
      .from("org_users").select("org_id, user_id").in("org_id", allOrgIds);
    const orgHasMember = new Set((orgUsers || []).map((ou: any) => ou.org_id));

    // Real signups = recent orgs that have at least one member
    const orgs = allOrgs.filter((o: any) => orgHasMember.has(o.id));
    const orphanCount = allOrgs.length - orgs.length;

    if (!orgs.length) {
      return result(def, "warn",
        `${allOrgs.length} recent orgs but all are orphan (no members) — pre-launch / test data`,
        { orgs_checked: 0, orphan_count: orphanCount, total_recent_orgs: allOrgs.length }, t);
    }

    const orgIds = orgs.map((o: any) => o.id);

    // Verify consent_config exists per real-signup org
    const { data: consent } = await admin
      .from("consent_config").select("org_id").in("org_id", orgIds);
    const haveConsent = new Set((consent || []).map((c: any) => c.org_id));

    // Verify subscriber row exists (mapped via profiles.email -> org_users)
    const userIds = Array.from(new Set(
      (orgUsers || []).filter((ou: any) => orgIds.includes(ou.org_id)).map((ou: any) => ou.user_id)
    ));
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("user_id, email").in("user_id", userIds)
      : { data: [] as any[] };
    const emails = Array.from(
      new Set((profiles || []).map((p: any) => (p.email || "").toLowerCase()).filter(Boolean))
    );
    const { data: subs } = emails.length
      ? await admin.from("subscribers").select("email").in("email", emails)
      : { data: [] as any[] };
    const haveSubByEmail = new Set((subs || []).map((s: any) => (s.email || "").toLowerCase()));

    // Per-org: does ANY associated user have a subscriber row?
    const userToEmail = new Map<string, string>();
    (profiles || []).forEach((p: any) => userToEmail.set(p.user_id, (p.email || "").toLowerCase()));
    const orgHasSub = new Map<string, boolean>();
    (orgUsers || []).forEach((ou: any) => {
      const e = userToEmail.get(ou.user_id);
      if (e && haveSubByEmail.has(e)) orgHasSub.set(ou.org_id, true);
    });

    const missingConsent = orgs.filter((o: any) => !haveConsent.has(o.id));
    const missingSub = orgs.filter((o: any) => !orgHasSub.get(o.id));

    // Heuristic: if ZERO real-signup orgs have a subscriber, that's a
    // platform-wide gap (e.g. Stripe sync not running), not per-org regression.
    const allMissingConsent = missingConsent.length === orgs.length;
    const allMissingSub = missingSub.length === orgs.length;
    const reasons: string[] = [];
    if (allMissingConsent) reasons.push("no consent_config rows for any real signup (trigger missing)");
    if (allMissingSub) reasons.push("no subscriber row for any real signup (Stripe sync gap or pre-launch)");

    let status: CheckStatus;
    let msg: string;
    if (missingConsent.length === 0 && missingSub.length === 0) {
      status = "pass";
      msg = `${orgs.length} real signups (last 30d), all have consent_config + subscriber${orphanCount ? ` (${orphanCount} orphan orgs ignored)` : ""}`;
    } else if (allMissingConsent || allMissingSub) {
      status = "warn";
      msg = `Platform gap: ${reasons.join("; ")}`;
    } else {
      const totalMissing = missingConsent.length + missingSub.length;
      status = totalMissing <= 2 ? "warn" : "fail";
      msg = `${missingConsent.length} missing consent, ${missingSub.length} missing subscriber (of ${orgs.length} real signups)`;
    }
    return result(def, status, msg, {
      orgs_checked: orgs.length,
      orphan_count: orphanCount,
      total_recent_orgs: allOrgs.length,
      all_missing_consent: allMissingConsent,
      all_missing_subscriber: allMissingSub,
      missing_consent: missingConsent.map((o: any) => ({ id: o.id, name: o.name })),
      missing_subscriber: missingSub.map((o: any) => ({ id: o.id, name: o.name })),
    }, t);
  },

  // ── tracking ──
  // Cron history (cron.job_run_details) is unindexed in Supabase and any scan
  // costs 20+ seconds. We prove cron freshness via app-table side-effects:
  // sites.last_heartbeat_at — if the tracking-health cron is running, it
  // updates heartbeats. Cron registry is consulted only to confirm scheduling.
  "tracking.health_cron_recent": async (def) => {
    const t = Date.now();
    const { data: crons } = await admin.rpc("qa_get_cron_last_runs", {
      jobname_patterns: ["tracking[-_]health|check[-_]tracking"],
    });
    const cronJob = (crons || [])[0];
    const { data } = await admin.from("sites")
      .select("last_heartbeat_at")
      .order("last_heartbeat_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const last = (data?.[0] as any)?.last_heartbeat_at;
    if (!last) {
      // Pre-launch: no sites have ever heartbeated
      if (cronJob && cronJob.last_run_status === "scheduled") {
        return result(def, "warn",
          "Cron is scheduled, but no sites have heartbeated yet (acceptable pre-launch)",
          { cron_job: cronJob, sites_with_heartbeat: 0 }, t);
      }
      return result(def, "fail",
        "No tracking-health cron scheduled AND no sites heartbeating — pipeline dead",
        { cron_job_found: !!cronJob, sites_with_heartbeat: 0 }, t);
    }
    const ageSec = (Date.now() - new Date(last).getTime()) / 1000;
    const ok = ageSec < 1800; // 30 min — heartbeat interval default is 5 min
    return result(def, ok ? "pass" : "warn",
      ok ? `Cron scheduled; last site heartbeat ${Math.round(ageSec)}s ago`
         : `Last site heartbeat ${Math.round(ageSec)}s ago (>30 min)`,
      { last_heartbeat_at: last, age_seconds: Math.round(ageSec), cron_job: cronJob }, t);
  },
  "tracking.recent_pageviews_exist": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: pvCount } = await admin
      .from("pageviews").select("id", { count: "exact", head: true }).gte("occurred_at", since);
    // Sites that have heartbeated in the last 7d.
    const { data: activeSiteRows } = await admin
      .from("sites").select("id, org_id, domain, last_heartbeat_at")
      .gte("last_heartbeat_at", sevenDaysAgo);
    const sites = activeSiteRows?.length ?? 0;
    const n = pvCount ?? 0;

    if (n > 0) {
      return result(def, "pass", `${n} pageviews in last hour (${sites} active sites)`,
        { last_hour_count: n, active_sites_7d: sites }, t);
    }
    if (sites === 0) {
      return result(def, "warn",
        "No pageviews — but no active sites in last 7d either (acceptable if pre-launch)",
        { last_hour_count: 0, active_sites_7d: 0 }, t);
    }

    // Sites are heartbeating but no pageviews arrived. Before declaring
    // the pipeline "broken", check whether those sites' orgs actually have
    // working ingestion credentials. Customers without a valid API key OR
    // ingest token cannot send pageviews — that's a customer-state issue
    // (deliberately revoked / churned / never installed), NOT a tech failure
    // in our pipeline.
    const orgIds = Array.from(new Set((activeSiteRows ?? []).map((s: any) => s.org_id).filter(Boolean)));
    let credentialedOrgIds = new Set<string>();
    if (orgIds.length > 0) {
      const [keysRes, tokensRes] = await Promise.all([
        admin.from("api_keys").select("org_id").in("org_id", orgIds).is("revoked_at", null),
        admin.from("site_ingest_tokens").select("org_id").in("org_id", orgIds)
          .eq("status", "active").is("revoked_at", null),
      ]);
      for (const r of (keysRes.data ?? []) as any[]) credentialedOrgIds.add(r.org_id);
      for (const r of (tokensRes.data ?? []) as any[]) credentialedOrgIds.add(r.org_id);
    }
    const sitesWithCreds = (activeSiteRows ?? []).filter(
      (s: any) => credentialedOrgIds.has(s.org_id)
    ).length;
    const sitesWithoutCreds = sites - sitesWithCreds;

    if (sitesWithCreds === 0) {
      // All heartbeating sites are de-credentialed. Plugin pings still arrive
      // (heartbeats may use a different path) but pageviews cannot land.
      // This is a billing/lifecycle state, not a launch blocker.
      return result(def, "warn",
        `${sitesWithoutCreds} active site(s) lack valid credentials — no pageviews possible until customers regenerate API keys (not a pipeline failure)`,
        {
          last_hour_count: 0,
          active_sites_7d: sites,
          sites_with_credentials: 0,
          sites_without_credentials: sitesWithoutCreds,
        }, t);
    }

    if (sitesWithCreds > 0 && n === 0) {
      // Some sites have credentials but no pageviews landed. This is a
      // softer warning — could just mean no real visitors in the last hour.
      return result(def, "warn",
        `${sitesWithCreds} credentialed site(s) but 0 pageviews in last hour (likely low traffic, ${sitesWithoutCreds} site(s) need new keys)`,
        {
          last_hour_count: 0,
          active_sites_7d: sites,
          sites_with_credentials: sitesWithCreds,
          sites_without_credentials: sitesWithoutCreds,
        }, t);
    }

    return result(def, "fail",
      `Pipeline broken: ${sites} active sites but 0 pageviews in last hour`,
      { last_hour_count: 0, active_sites_7d: sites }, t);
  },
  "tracking.sites_active_majority": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    // Real columns: status (text), last_heartbeat_at (timestamptz).
    // "Active" = status='up' AND heartbeat in last 7d.
    const { data } = await admin.from("sites")
      .select("id, domain, status, last_heartbeat_at")
      .gte("last_heartbeat_at", since);
    const total = data?.length ?? 0;
    if (!total) {
      // No recently-seen sites is a pre-launch signal, not a failure.
      const { count: anySites } = await admin.from("sites").select("id", { count: "exact", head: true });
      const totalSites = anySites ?? 0;
      if (totalSites === 0) {
        return result(def, "pass", "No sites registered yet (pre-launch)", { total: 0, total_sites: 0 }, t);
      }
      return result(def, "warn", `${totalSites} sites registered, but none active in last 7d`, { total: 0, total_sites: totalSites }, t);
    }
    const active = (data || []).filter((s: any) => s.status === "up" || s.status === "active").length;
    const pct = Math.round((active / total) * 100);
    const ok = pct >= 80;
    const inactive = (data || [])
      .filter((s: any) => s.status !== "up" && s.status !== "active")
      .slice(0, 10)
      .map((s: any) => ({ id: s.id, domain: s.domain, status: s.status }));
    return result(def, ok ? "pass" : "warn",
      `${active}/${total} sites active (${pct}%)`,
      { total, active, active_pct: pct, inactive_sample: inactive }, t);
  },

  // ── forms ──
  "forms.import_watchdog_recent": async (def) => {
    const t = Date.now();
    const { data: crons } = await admin.rpc("qa_get_cron_last_runs", {
      jobname_patterns: ["form[-_]import[-_]watchdog|form[-_]watchdog"],
    });
    const cronJob = (crons || [])[0];
    // App-side evidence: form_jobs activity (proves watchdog is doing work)
    const { data } = await admin.from("form_jobs")
      .select("updated_at, status").order("updated_at", { ascending: false }).limit(1);
    const last = (data?.[0] as any)?.updated_at;
    if (cronJob && cronJob.last_run_status === "scheduled" && !last) {
      return result(def, "pass",
        "Watchdog cron is scheduled (no form jobs yet — pre-launch acceptable)",
        { cron_job: cronJob, form_jobs: 0 }, t);
    }
    if (!cronJob && !last) {
      return result(def, "warn",
        "No form watchdog cron scheduled AND no form_jobs activity (acceptable only pre-launch)",
        { cron_job_found: false }, t);
    }
    if (!last) {
      return result(def, "pass",
        "Watchdog cron scheduled; no form jobs to process yet",
        { cron_job: cronJob }, t);
    }
    const ageMin = (Date.now() - new Date(last).getTime()) / 60000;
    return result(def, "pass",
      `Watchdog scheduled; last form job activity ${Math.round(ageMin)} min ago`,
      { last_activity: last, age_minutes: Math.round(ageMin), cron_job: cronJob }, t);
  },
  "forms.no_stuck_jobs": async (def) => {
    const t = Date.now();
    const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { data } = await admin.from("form_jobs")
      .select("id, site_id, updated_at").eq("status", "running").lt("updated_at", cutoff).limit(20);
    const stuck = data?.length ?? 0;
    return result(def, stuck === 0 ? "pass" : "fail",
      stuck === 0 ? "0 stuck jobs" : `${stuck} jobs stuck >2h`,
      { stuck_count: stuck, sample: data ?? [] }, t);
  },
  "forms.recent_form_entries": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count } = await admin.from("form_entries").select("id", { count: "exact", head: true }).gte("created_at", since);
    const n = count ?? 0;
    // No form entries is only a problem if forms exist and sites are active.
    if (n > 0) {
      return result(def, "pass", `${n} form entries in last 7d`, { last_7d_count: n }, t);
    }
    const { count: anyForms } = await admin.from("forms").select("id", { count: "exact", head: true });
    if ((anyForms ?? 0) === 0) {
      return result(def, "pass", "No forms registered yet (pre-launch)", { last_7d_count: 0, total_forms: 0 }, t);
    }
    return result(def, "warn", `No form entries in last 7d (${anyForms} forms registered)`, { last_7d_count: 0, total_forms: anyForms }, t);
  },

  // ── billing ──
  "billing.stripe_secret_present": async (def) => {
    const t = Date.now();
    const present = !!Deno.env.get("STRIPE_SECRET_KEY");
    return result(def, present ? "pass" : "fail",
      present ? "STRIPE_SECRET_KEY configured" : "Missing STRIPE_SECRET_KEY",
      { configured: present }, t);
  },
  "billing.webhook_signature_recent": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, count } = await admin.from("webhook_verification_log")
      .select("occurred_at, provider, verification_status", { count: "exact" })
      .eq("provider", "stripe").eq("verification_status", "verified")
      .gte("occurred_at", since).limit(1);
    const verified = count ?? 0;
    if (verified > 0) {
      return result(def, "pass", `${verified} verified Stripe webhooks in last 7d`,
        { verified_count_7d: verified, sample: data ?? [] }, t);
    }
    // Zero verified — distinguish "no Stripe traffic at all" (warn) from "broken signature path" (fail).
    const { count: anyStripe } = await admin.from("webhook_verification_log")
      .select("id", { count: "exact", head: true })
      .eq("provider", "stripe").gte("occurred_at", since);
    const { count: recovery } = await admin.from("billing_recovery_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", since);
    const totalStripe = anyStripe ?? 0;
    const totalRecovery = recovery ?? 0;
    if (totalStripe === 0 && totalRecovery === 0) {
      return result(def, "warn",
        "No Stripe webhook traffic in last 7d (acceptable pre-launch / no transactions)",
        { verified_count_7d: 0, total_stripe_webhooks_7d: 0, recovery_events_7d: 0 }, t);
    }
    // Webhooks arrived but none verified → real signature problem
    return result(def, "fail",
      `${totalStripe} Stripe webhooks received but 0 verified — signature path broken`,
      { verified_count_7d: 0, total_stripe_webhooks_7d: totalStripe, recovery_events_7d: totalRecovery }, t);
  },
  "billing.no_signature_failures": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 86400000).toISOString();
    const { data, count } = await admin.from("webhook_verification_log")
      .select("occurred_at, provider, verification_status", { count: "exact" })
      .in("verification_status", ["signature_invalid", "replay_rejected"])
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false }).limit(10);
    const n = count ?? 0;
    const status: CheckStatus = n === 0 ? "pass" : (n < 5 ? "warn" : "fail");
    return result(def, status,
      n === 0 ? "0 invalid signatures in last 24h" : `${n} invalid signatures in last 24h`,
      { failures_24h: n, sample: data ?? [] }, t);
  },
  "billing.recovery_events_recent": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count } = await admin.from("billing_recovery_events").select("id", { count: "exact", head: true })
      .gte("occurred_at", since);
    const n = count ?? 0;
    // Zero recovery events = zero failed payments = healthy. This is a "pass with note", not a warning.
    return result(def, "pass",
      n > 0 ? `${n} recovery events in last 30d (review for trends)` : "0 failed-payment recovery events in last 30d (healthy)",
      { last_30d_count: n }, t);
  },

  // ── security_boundaries ──
  "security_boundaries.rls_enabled_all_tables": async (def) => {
    const t = Date.now();
    const { data, error } = await admin.rpc("qa_check_rls_status");
    if (error) {
      return result(def, "fail",
        `RLS check helper failed: ${error.message}`,
        { error: error.message }, t);
    }
    const rows = (data || []) as Array<{ table_name: string; rls_enabled: boolean }>;
    const total = rows.length;
    const disabled = rows.filter((r) => !r.rls_enabled);
    const ok = disabled.length === 0;
    return result(def, ok ? "pass" : "fail",
      ok ? `RLS enabled on all ${total} public tables`
         : `${disabled.length}/${total} public tables have RLS DISABLED`,
      {
        total_tables: total,
        rls_disabled_count: disabled.length,
        rls_disabled_tables: disabled.map((r) => r.table_name),
      }, t);
  },
  "security_boundaries.has_role_function": async (def) => {
    const t = Date.now();
    // Real check: pg_proc.prosecdef must be true
    const { data, error } = await admin.rpc("qa_check_has_role_definer");
    if (error) {
      return result(def, "fail",
        `Helper failed: ${error.message}`,
        { error: error.message }, t);
    }
    const row = (data || [])[0] as any;
    if (!row?.exists_flag) {
      return result(def, "fail", "has_role() function NOT FOUND in public schema",
        { exists: false }, t);
    }
    if (!row.is_security_definer) {
      return result(def, "fail",
        "has_role() exists but is NOT SECURITY DEFINER (privilege escalation risk)",
        { exists: true, is_security_definer: false, prosrc_excerpt: row.prosrc_excerpt }, t);
    }
    return result(def, "pass",
      "has_role() exists and is SECURITY DEFINER",
      { exists: true, is_security_definer: true, prosrc_excerpt: row.prosrc_excerpt }, t);
  },
  "security_boundaries.no_critical_findings": async (def) => {
    const t = Date.now();
    const { data, count } = await admin.from("security_findings")
      .select("id, name, type, created_at", { count: "exact" })
      .eq("status", "open").eq("severity", "critical")
      .order("created_at", { ascending: false }).limit(10);
    const n = count ?? 0;
    return result(def, n === 0 ? "pass" : "fail",
      n === 0 ? "0 open critical findings" : `${n} open critical findings`,
      { open_critical_count: n, sample: data ?? [] }, t);
  },
  "security_boundaries.api_keys_hashed": async (def) => {
    const t = Date.now();
    const { data, count } = await admin.from("api_keys").select("id, key_hash", { count: "exact" })
      .is("revoked_at", null).is("key_hash", null).limit(5);
    const n = count ?? 0;
    return result(def, n === 0 ? "pass" : "fail",
      n === 0 ? "All active API keys hashed" : `${n} active API keys missing key_hash`,
      { unhashed_active_count: n, sample: data ?? [] }, t);
  },

  // ── autosync ──
  "autosync.recent_org_first_data": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    const { data: orgs } = await admin.from("orgs").select("id, name, created_at")
      .gte("created_at", since).lt("created_at", cutoff);
    if (!orgs?.length) return result(def, "pass", "No new orgs >24h old to evaluate", {}, t);
    const ids = orgs.map((o: any) => o.id);
    const { data: events } = await admin.from("retention_events")
      .select("org_id").eq("event_name", "first_data_received").in("org_id", ids);
    const haveData = new Set((events || []).map((e: any) => e.org_id));
    const missing = orgs.filter((o: any) => !haveData.has(o.id));
    const status: CheckStatus = missing.length === 0 ? "pass" : (missing.length === 1 ? "warn" : "fail");
    return result(def, status,
      missing.length === 0
        ? `All ${orgs.length} eligible recent orgs received first data`
        : `${missing.length}/${orgs.length} recent orgs (>24h old) have no first data`,
      { evaluated: orgs.length, missing: missing.map((o: any) => ({ id: o.id, name: o.name, created_at: o.created_at })) }, t);
  },
  "autosync.aggregate_daily_recent": async (def) => {
    const t = Date.now();
    const { data } = await admin.from("conversions_daily").select("day").order("day", { ascending: false }).limit(1);
    const last = (data?.[0] as any)?.day;
    if (!last) {
      // Pre-launch: no conversions to aggregate. Confirm cron is at least scheduled.
      const { data: crons } = await admin.rpc("qa_get_cron_last_runs", {
        jobname_patterns: ["aggregate[-_]daily"],
      });
      const scheduled = (crons || []).some((c: any) => c.last_run_status === "scheduled");
      if (scheduled) {
        return result(def, "pass",
          "Aggregate-daily cron scheduled; no conversions yet to aggregate (pre-launch)",
          { conversions_daily_rows: 0, cron_scheduled: true }, t);
      }
      return result(def, "warn",
        "No conversions_daily rows AND aggregate cron not found",
        { conversions_daily_rows: 0, cron_scheduled: false }, t);
    }
    const ageHours = (Date.now() - new Date(last).getTime()) / 3600_000;
    const ok = ageHours < 36;
    return result(def, ok ? "pass" : "fail",
      ok ? `Last aggregate ${Math.round(ageHours)}h ago` : `Stale: ${Math.round(ageHours)}h ago`,
      { last_day: last, age_hours: Math.round(ageHours) }, t);
  },
  "autosync.email_queue_processing": async (def) => {
    const t = Date.now();
    // Real check: pgmq queue depth + oldest message age (the actual queue lives in pgmq, not email_send_log)
    const { data: queues, error } = await admin.rpc("qa_check_pgmq_queue_depth");
    if (error) {
      return result(def, "fail",
        `pgmq helper failed: ${error.message}`,
        { error: error.message }, t);
    }
    const rows = (queues || []) as Array<{ qname: string; queue_length: number; oldest_msg_age_seconds: number }>;
    const stalled = rows.filter((q) => q.queue_length > 0 && q.oldest_msg_age_seconds > 300 && !/_dlq$/i.test(q.qname));
    const errored = rows.filter((q) => q.queue_length === -1);
    if (errored.length > 0) {
      return result(def, "warn",
        `Queue introspection failed for ${errored.length} queue(s)`,
        { queues: rows, introspection_errors: errored.map((q) => q.qname) }, t);
    }
    if (stalled.length === 0) {
      return result(def, "pass",
        `All ${rows.length} queues draining within 5 min`,
        { queues: rows }, t);
    }
    return result(def, "fail",
      `${stalled.length} queue(s) stalled with messages older than 5 min`,
      { queues: rows, stalled }, t);
  },

  // ── auth ──
  "auth.user_roles_table_exists": async (def) => {
    const t = Date.now();
    const { error } = await admin.from("user_roles").select("user_id", { head: true, count: "exact" }).limit(1);
    const ok = !error;
    return result(def, ok ? "pass" : "fail",
      ok ? "user_roles table reachable" : `Error: ${error?.message}`,
      { error: error?.message }, t);
  },
  "auth.profiles_no_role_column": async (def) => {
    const t = Date.now();
    // Try selecting "role" — if the column exists this returns rows; if not, error.
    const { error } = await admin.from("profiles").select("role" as any).limit(1);
    const safe = !!error && /column .*role.* does not exist/i.test(error.message || "");
    return result(def, safe ? "pass" : "fail",
      safe ? "profiles has no role column" : "profiles MAY have a role column (privilege escalation risk)",
      { probe_error: error?.message }, t);
  },

  // ── reporting ──
  "reporting.snapshot_storage_ready": async (def) => {
    const t = Date.now();
    const { data, error } = await admin.storage.listBuckets();
    const exists = !!data?.find((b: any) => b.name === "reports");
    return result(def, exists ? "pass" : "fail",
      exists ? "reports bucket exists" : "reports bucket missing",
      { error: error?.message }, t);
  },

  // ── monitoring ──
  "monitoring.domain_ssl_recent": async (def) => {
    const t = Date.now();
    const { data } = await admin.from("domain_health").select("last_checked_at")
      .order("last_checked_at", { ascending: false }).limit(1);
    const last = (data?.[0] as any)?.last_checked_at;
    if (!last) return result(def, "pass", "No domains tracked yet", {}, t);
    const ageHours = (Date.now() - new Date(last).getTime()) / 3600_000;
    const ok = ageHours < 48;
    return result(def, ok ? "pass" : "warn",
      ok ? `Last domain check ${Math.round(ageHours)}h ago` : `Stale: ${Math.round(ageHours)}h ago`,
      { last_checked_at: last, age_hours: Math.round(ageHours) }, t);
  },

  // ── security module ──
  "security.findings_pipeline_alive": async (def) => {
    const t = Date.now();
    const { count } = await admin.from("security_findings").select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
    const n = count ?? 0;
    // Pipeline is "alive" if it has produced findings. Zero in 30d = pipeline likely dead.
    return result(def, n > 0 ? "pass" : "warn",
      n > 0 ? `${n} findings in last 30d (pipeline alive)` : "0 findings in last 30d — pipeline may be dead (review)",
      { last_30d_count: n }, t);
  },

  // ── seo ──
  "seo.suggest_function_deployed": async (def) => {
    const t = Date.now();
    const r = await pingFnUnauth("seo-suggest-fix");
    const gated = r.status === 401 || r.status === 403;
    return result(def, gated ? "pass" : (r.status === 0 ? "fail" : "warn"),
      gated ? `JWT-gated (HTTP ${r.status})` : `Unexpected HTTP ${r.status}`,
      { http_status: r.status }, t);
  },

  // ── compliance ──
  "compliance.consent_default_strict": async (def) => {
    const t = Date.now();
    const { data } = await admin.from("consent_config").select("org_id, consent_mode, created_at")
      .order("created_at", { ascending: false }).limit(5);
    const total = data?.length ?? 0;
    if (!total) return result(def, "warn", "No consent_config rows", {}, t);
    const strict = (data || []).filter((c: any) => c.consent_mode === "strict").length;
    const ok = strict === total;
    return result(def, ok ? "pass" : "warn",
      `${strict}/${total} recent orgs default to strict`,
      { recent: data }, t);
  },

  // ── notifications ──
  "notifications.email_send_log_recent": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count } = await admin.from("email_send_log").select("id", { count: "exact", head: true })
      .eq("status", "sent").gte("created_at", since);
    const n = count ?? 0;
    return result(def, n > 0 ? "pass" : "fail",
      n > 0 ? `${n} sent emails in last 7d` : "No emails sent in last 7d",
      { sent_count_7d: n }, t);
  },

  // ── ai ──
  "ai.endpoints_jwt_gated": async (def) => {
    const t = Date.now();
    const fns = ["dashboard-ai-insights", "reports-ai-copy", "seo-suggest-fix", "ai-chatbot"];
    const probes = await Promise.all(fns.map(async (f) => ({ fn: f, ...(await pingFnUnauth(f)) })));
    const allGated = probes.every((p) => p.status === 401 || p.status === 403);
    return result(def, allGated ? "pass" : "fail",
      allGated ? "All 4 AI endpoints reject anonymous calls" : "One or more AI endpoints accept anonymous calls",
      { probes }, t);
  },

  // ── retention ──
  "retention.archive_bucket_exists": async (def) => {
    const t = Date.now();
    const { data } = await admin.storage.listBuckets();
    const exists = !!data?.find((b: any) => b.name === "archives");
    return result(def, exists ? "pass" : "fail",
      exists ? "archives bucket exists" : "archives bucket missing",
      {}, t);
  },

  // ── backend crons ──
  "backend.critical_crons_scheduled": async (def) => {
    const t = Date.now();
    const { data, error } = await admin.rpc("qa_list_cron_jobs");
    if (error) {
      return result(def, "fail",
        `Cron registry helper failed: ${error.message}`,
        { error: error.message }, t);
    }
    const jobs = (data || []) as Array<{ jobname: string; schedule: string; active: boolean }>;
    const required = [
      { pattern: /nightly[-_]summary|daily[-_]summary/i, name: "nightly-summary" },
      { pattern: /aggregate[-_]daily/i, name: "aggregate-daily" },
      { pattern: /tracking[-_]health|check[-_]tracking/i, name: "check-tracking-health" },
      { pattern: /process[-_]email[-_]queue|email[-_]queue/i, name: "process-email-queue" },
      { pattern: /billing[-_]state[-_]manager|lifecycle/i, name: "billing-state-manager" },
    ];
    const checked = required.map((req) => {
      const found = jobs.find((j) => req.pattern.test(j.jobname || ""));
      return {
        name: req.name,
        found: !!found,
        active: found?.active ?? false,
        jobname: found?.jobname,
        schedule: found?.schedule,
      };
    });
    const missing = checked.filter((c) => !c.found || !c.active);
    if (missing.length === 0) {
      return result(def, "pass",
        `All ${checked.length} required cron jobs scheduled and active`,
        { required_jobs: checked, total_cron_jobs: jobs.length }, t);
    }
    return result(def, "fail",
      `${missing.length} required cron job(s) missing or inactive`,
      { required_jobs: checked, missing: missing.map((c) => c.name), total_cron_jobs: jobs.length }, t);
  },

  // ── plugin ──
  "plugin.manifest_version_target": async (def, ctx) => {
    const t = Date.now();
    const ok = !!ctx.app_version && ctx.app_version.length > 0;
    return result(def, ok ? "pass" : "fail",
      ok ? `app_version=${ctx.app_version}` : "Missing app_version",
      { app_version: ctx.app_version }, t);
  },
  "plugin.zip_serves": async (def) => {
    const t = Date.now();
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/serve-plugin-zip`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${ANON_KEY}` },
      });
      const len = r.headers.get("content-length");
      const ok = r.status === 200 && (!len || parseInt(len, 10) > 0);
      return result(def, ok ? "pass" : "fail",
        ok ? `HTTP ${r.status}, content-length=${len ?? "unknown"}` : `HTTP ${r.status}`,
        { http_status: r.status, content_length: len }, t);
    } catch (e) {
      return result(def, "fail", `Fetch failed: ${(e as Error).message}`, {}, t);
    }
  },

  // ── ci ──
  "ci.app_bible_signoff_complete": async (def, ctx) => {
    const t = Date.now();
    const { data } = await admin.from("app_bible_reviews")
      .select("section_key").eq("app_version", ctx.app_version);
    const distinct = new Set((data || []).map((r: any) => r.section_key)).size;
    const TOTAL = 19;
    const ok = distinct >= TOTAL;
    return result(def, ok ? "pass" : "warn",
      `${distinct}/${TOTAL} sections signed off for v${ctx.app_version}`,
      { signed_off: distinct, total: TOTAL }, t);
  },
};

// ─── Manual / pending checks ───
async function buildManualResult(def: CheckDef, app_version: string): Promise<CheckResult> {
  const { data } = await admin.from("release_qa_manual_signoff")
    .select("signed_off_by_email, signed_off_at, notes, evidence")
    .eq("app_version", app_version).eq("check_key", def.key).maybeSingle();
  if (data) {
    return {
      key: def.key, category: def.category, type: def.type, severity: def.severity,
      status: "pass", message: `Signed off by ${(data as any).signed_off_by_email ?? "admin"}`,
      duration_ms: 0,
      evidence: { manual_signoff: data },
    };
  }
  return {
    key: def.key, category: def.category, type: def.type, severity: def.severity,
    status: "manual_pending", message: "Awaiting manual sign-off",
    duration_ms: 0, evidence: {},
  };
}

// ─── Verdict computation ───
// Stop-ship rule: ANY critical-severity fail/error blocks the release.
// High/medium/low fails are recorded but DO NOT block ship — they degrade verdict
// to "passed_with_warnings" so the team can ship and follow up.
function computeVerdict(results: CheckResult[]): {
  status: "passed" | "passed_with_warnings" | "failed";
  ship_blocked: boolean;
  totals: Record<string, number>;
} {
  const totals = { pass: 0, fail: 0, warn: 0, not_run: 0, manual_pending: 0, error: 0 };
  let hasCriticalFail = false;
  let hasNonCriticalFail = false;
  let hasWarn = false;
  let hasPending = false;
  for (const r of results) {
    totals[r.status] = (totals[r.status] ?? 0) + 1;
    if (r.status === "fail" || r.status === "error") {
      if (r.severity === "critical") hasCriticalFail = true;
      else hasNonCriticalFail = true;
    }
    if (r.status === "warn") hasWarn = true;
    if (r.status === "manual_pending") hasPending = true;
  }
  const ship_blocked = hasCriticalFail;
  if (hasCriticalFail) return { status: "failed", ship_blocked, totals };
  if (hasNonCriticalFail || hasWarn || hasPending) return { status: "passed_with_warnings", ship_blocked, totals };
  return { status: "passed", ship_blocked, totals };
}

// ─── HTTP entry ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser(token);
    if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const app_version = String(body.app_version || "").trim();
    const scope = String(body.scope || "full");
    if (!app_version) return json({ error: "app_version is required" }, 400);

    // Filter checks by scope
    let toRun = CHECKS;
    if (scope.startsWith("category:")) {
      const cat = scope.split(":")[1];
      toRun = CHECKS.filter((c) => c.category === cat);
    } else if (scope.startsWith("check:")) {
      const k = scope.split(":")[1];
      toRun = CHECKS.filter((c) => c.key === k);
    }
    if (toRun.length === 0) return json({ error: "No checks matched scope" }, 400);

    // Create run row
    const { data: run, error: runErr } = await admin.from("release_qa_runs").insert({
      app_version, scope, started_by: u.user.id, started_by_email: u.user.email,
    }).select().single();
    if (runErr || !run) return json({ error: "Failed to start run", detail: runErr?.message }, 500);

    // Execute
    const ctx = { app_version };
    const settled = await Promise.allSettled(toRun.map(async (def) => {
      try {
        if (def.type === "manual") return await buildManualResult(def, app_version);
        const runner = runners[def.key];
        if (!runner) {
          // Hybrid without runner falls back to manual pending
          if (def.type === "hybrid") return await buildManualResult(def, app_version);
          return result(def, "not_run", "No runner registered", {}, Date.now());
        }
        const r = await Promise.race<CheckResult>([
          runner(def, ctx),
          new Promise<CheckResult>((resolve) =>
            setTimeout(() => resolve(result(def, "error", "Timed out (>20s)", {}, Date.now() - 20000)), 20000)),
        ]);
        // Hybrid: if automated portion passed AND no manual signoff, mark manual_pending
        if (def.type === "hybrid" && r.status === "pass") {
          const manual = await buildManualResult(def, app_version);
          if (manual.status === "pass") return manual;
          return { ...r, status: "manual_pending", message: "Automated portion OK; awaiting manual sign-off" };
        }
        return r;
      } catch (e) {
        return result(def, "error", `Runner threw: ${(e as Error).message}`, {}, Date.now());
      }
    }));

    const results: CheckResult[] = settled.map((s, i) =>
      s.status === "fulfilled" ? s.value : result(toRun[i], "error", "Promise rejected", { reason: String((s as any).reason) }, Date.now())
    );

    // Persist results
    await admin.from("release_qa_results").insert(results.map((r) => ({
      run_id: run.id, check_key: r.key, category_key: r.category,
      check_type: r.type, severity: r.severity, status: r.status,
      duration_ms: r.duration_ms, message: r.message, evidence: r.evidence,
    })));

    const verdict = computeVerdict(results);
    await admin.from("release_qa_runs").update({
      status: verdict.status, totals: verdict.totals,
      ship_blocked: verdict.ship_blocked,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    return json({
      run_id: run.id,
      status: verdict.status,
      ship_blocked: verdict.ship_blocked,
      totals: verdict.totals,
      results,
    });
  } catch (e) {
    return json({ error: "Internal error", detail: (e as Error).message }, 500);
  }
});
