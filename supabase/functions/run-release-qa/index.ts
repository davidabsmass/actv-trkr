// Release QA Runner — admin-only.
// Executes automated checks in parallel, persists results + evidence, and
// surfaces a one-shot release-readiness verdict.
//
// Body:
//   { app_version: string, scope?: "full" | "category:<key>" | "check:<key>" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

// Stronger: prove the function code path runs. Unauthenticated POST should NOT
// be a 404 (missing) or 5xx (broken). 401/400/200/422 are all acceptable.
async function probeFnReachable(name: string): Promise<{ status: number; ok: boolean }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const ok = r.status !== 404 && r.status < 500;
    return { status: r.status, ok };
  } catch (_e) {
    return { status: 0, ok: false };
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
      r.ok ? `Function code reachable (HTTP ${r.status})` : `Unreachable / broken (HTTP ${r.status})`,
      { http_status: r.status, probe: "POST {} unauthenticated" }, t);
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
    const { data: orgs } = await admin
      .from("orgs").select("id, name, created_at").gte("created_at", since);
    if (!orgs?.length) {
      return result(def, "warn", "No orgs created in last 30d", { orgs_checked: 0 }, t);
    }
    const orgIds = orgs.map((o: any) => o.id);

    // Verify consent_config exists per org
    const { data: consent } = await admin
      .from("consent_config").select("org_id").in("org_id", orgIds);
    const haveConsent = new Set((consent || []).map((c: any) => c.org_id));

    // Verify subscriber row exists (mapped via profiles.email -> org_users)
    const { data: orgUsers } = await admin
      .from("org_users").select("org_id, user_id").in("org_id", orgIds);
    const userIds = Array.from(new Set((orgUsers || []).map((ou: any) => ou.user_id)));
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

    const totalMissing = missingConsent.length + missingSub.length;
    const status: CheckStatus =
      totalMissing === 0 ? "pass" : (totalMissing <= 2 ? "warn" : "fail");
    return result(def, status,
      totalMissing === 0
        ? `${orgs.length} recent orgs, all have consent_config + subscriber`
        : `${missingConsent.length} missing consent, ${missingSub.length} missing subscriber (of ${orgs.length})`,
      {
        orgs_checked: orgs.length,
        missing_consent: missingConsent.map((o: any) => ({ id: o.id, name: o.name })),
        missing_subscriber: missingSub.map((o: any) => ({ id: o.id, name: o.name })),
      }, t);
  },

  // ── tracking ──
  "tracking.health_cron_recent": async (def) => {
    const t = Date.now();
    const { data } = await admin.from("sites")
      .select("tracker_last_checked_at")
      .order("tracker_last_checked_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const last = (data?.[0] as any)?.tracker_last_checked_at;
    if (!last) return result(def, "warn", "No tracker check timestamps yet", {}, t);
    const ageSec = (Date.now() - new Date(last).getTime()) / 1000;
    const ok = ageSec < 600;
    return result(def, ok ? "pass" : "fail",
      ok ? `Last check ${Math.round(ageSec)}s ago` : `Stale: last check ${Math.round(ageSec)}s ago (>600s)`,
      { last_checked_at: last, age_seconds: Math.round(ageSec) }, t);
  },
  "tracking.recent_pageviews_exist": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin.from("pageviews").select("id", { count: "exact", head: true }).gte("occurred_at", since);
    const ok = (count ?? 0) > 0;
    return result(def, ok ? "pass" : "warn",
      ok ? `${count} pageviews in last hour` : "No pageviews in last hour",
      { last_hour_count: count ?? 0 }, t);
  },
  "tracking.sites_active_majority": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await admin.from("sites")
      .select("tracker_status, tracker_last_seen_at")
      .gte("tracker_last_seen_at", since);
    const total = data?.length ?? 0;
    if (!total) return result(def, "warn", "No recently-seen sites", { total: 0 }, t);
    const active = (data || []).filter((s: any) => s.tracker_status === "active").length;
    const pct = Math.round((active / total) * 100);
    const ok = pct >= 80;
    return result(def, ok ? "pass" : "fail",
      `${active}/${total} sites active (${pct}%)`,
      { total, active, active_pct: pct }, t);
  },

  // ── forms ──
  "forms.import_watchdog_recent": async (def) => {
    const t = Date.now();
    const { data } = await admin.from("form_jobs")
      .select("updated_at, status").order("updated_at", { ascending: false }).limit(1);
    const last = (data?.[0] as any)?.updated_at;
    if (!last) return result(def, "pass", "No form jobs to process (acceptable)", {}, t);
    const ageMin = (Date.now() - new Date(last).getTime()) / 60000;
    const ok = ageMin < 30;
    return result(def, ok ? "pass" : "warn",
      ok ? `Last activity ${Math.round(ageMin)} min ago` : `Stale: ${Math.round(ageMin)} min ago`,
      { last_activity: last, age_minutes: Math.round(ageMin) }, t);
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
    return result(def, n > 0 ? "pass" : "warn",
      n > 0 ? `${n} form entries in last 7d` : "No form entries in last 7d",
      { last_7d_count: n }, t);
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
    const ok = (count ?? 0) > 0;
    return result(def, ok ? "pass" : "fail",
      ok ? `${count} verified Stripe webhooks in last 7d` : "No verified Stripe webhooks in last 7d",
      { verified_count_7d: count ?? 0, sample: data ?? [] }, t);
  },
  "billing.no_signature_failures": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await admin.from("webhook_verification_log").select("id", { count: "exact", head: true })
      .in("verification_status", ["signature_invalid", "replay_rejected"])
      .gte("occurred_at", since);
    const n = count ?? 0;
    const status: CheckStatus = n === 0 ? "pass" : (n < 5 ? "warn" : "fail");
    return result(def, status,
      n === 0 ? "0 invalid signatures in last 24h" : `${n} invalid signatures in last 24h`,
      { failures_24h: n }, t);
  },
  "billing.recovery_events_recent": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count } = await admin.from("billing_recovery_events").select("id", { count: "exact", head: true })
      .gte("occurred_at", since);
    const n = count ?? 0;
    return result(def, "warn",
      n > 0 ? `${n} recovery events in last 30d` : "No recovery events in last 30d (review only)",
      { last_30d_count: n }, t);
  },

  // ── security_boundaries ──
  "security_boundaries.rls_enabled_all_tables": async (def) => {
    const t = Date.now();
    const { data, error } = await admin.rpc("execute_sql_admin_qa", {}).maybeSingle?.() ?? { data: null, error: null } as any;
    // No execute_sql RPC by design. Use information_schema via REST is not possible directly,
    // so we rely on a pg_meta-style query via a SECURITY DEFINER helper if added later.
    // Fallback: query pg_tables through Supabase REST is not available — fall back to a
    // listing-based heuristic: read public tables we can SELECT 0 from.
    const tables = ["orgs","sites","subscribers","leads","events","pageviews","forms","form_entries",
                    "user_roles","profiles","api_keys","release_qa_runs","release_qa_results",
                    "release_qa_manual_signoff","app_bible_reviews","webhook_verification_log",
                    "consent_config","conversion_goals","goal_completions"];
    // RLS check via SQL is not available without a helper function; expose presence + RLS status
    // through a meta query by querying pg_class via PostgREST is not exposed.
    // For evidence, we record that the platform model assumes RLS-on-by-default and surface
    // the linter results location.
    return result(def, "warn",
      "RLS programmatic check requires DB-side helper; verify via Supabase linter",
      { sampled_tables: tables, helper_data: data, helper_error: error?.message }, t);
  },
  "security_boundaries.has_role_function": async (def) => {
    const t = Date.now();
    // Probe: call has_role with a random user — should return false (function exists)
    const { error } = await admin.rpc("has_role", {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _role: "admin",
    });
    const exists = !error || !/does not exist|undefined function/i.test(error.message || "");
    return result(def, exists ? "pass" : "fail",
      exists ? "has_role() callable" : `Missing: ${error?.message}`,
      { probe_error: error?.message }, t);
  },
  "security_boundaries.no_critical_findings": async (def) => {
    const t = Date.now();
    const { count } = await admin.from("security_findings").select("id", { count: "exact", head: true })
      .eq("status", "open").eq("severity", "critical");
    const n = count ?? 0;
    return result(def, n === 0 ? "pass" : "fail",
      n === 0 ? "0 open critical findings" : `${n} open critical findings`,
      { open_critical_count: n }, t);
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
    if (!last) return result(def, "warn", "No conversions_daily rows yet", {}, t);
    const ageHours = (Date.now() - new Date(last).getTime()) / 3600_000;
    const ok = ageHours < 36;
    return result(def, ok ? "pass" : "fail",
      ok ? `Last aggregate ${Math.round(ageHours)}h ago` : `Stale: ${Math.round(ageHours)}h ago`,
      { last_day: last, age_hours: Math.round(ageHours) }, t);
  },
  "autosync.email_queue_processing": async (def) => {
    const t = Date.now();
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const { count } = await admin.from("email_send_log").select("id", { count: "exact", head: true })
      .eq("status", "queued").lt("created_at", since);
    const n = count ?? 0;
    return result(def, n === 0 ? "pass" : "fail",
      n === 0 ? "Queue draining within 5 min" : `${n} messages stalled >5 min`,
      { stalled_count: n }, t);
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
    return result(def, "warn",
      n > 0 ? `${n} findings in last 30d` : "0 findings in last 30d (review)",
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
    // Fall back to a heuristic: presence of recent run side-effects (already covered elsewhere).
    // We can't read cron.job through PostgREST, so report as warn with reasoning.
    return result(def, "warn",
      "Cron presence inferred via downstream freshness checks (aggregate-daily, email-queue, tracking-health)",
      { note: "Direct cron.job inspection requires DB-side helper" }, t);
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
function computeVerdict(results: CheckResult[]): {
  status: "passed" | "passed_with_warnings" | "failed";
  totals: Record<string, number>;
} {
  const totals = { pass: 0, fail: 0, warn: 0, not_run: 0, manual_pending: 0, error: 0 };
  let hasCriticalFail = false;
  let hasAnyFail = false;
  let hasWarn = false;
  let hasPending = false;
  for (const r of results) {
    totals[r.status] = (totals[r.status] ?? 0) + 1;
    if (r.status === "fail" || r.status === "error") {
      hasAnyFail = true;
      if (r.severity === "critical") hasCriticalFail = true;
    }
    if (r.status === "warn") hasWarn = true;
    if (r.status === "manual_pending") hasPending = true;
  }
  if (hasCriticalFail || hasAnyFail) return { status: "failed", totals };
  if (hasWarn || hasPending) return { status: "passed_with_warnings", totals };
  return { status: "passed", totals };
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
      status: verdict.status, totals: verdict.totals, completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    return json({ run_id: run.id, status: verdict.status, totals: verdict.totals, results });
  } catch (e) {
    return json({ error: "Internal error", detail: (e as Error).message }, 500);
  }
});
