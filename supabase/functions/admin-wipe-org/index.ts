// Owner-only "nuclear" wipe of a single organization.
// Removes: all org-scoped data, subscribers tied to org members, profiles,
// and the auth.users for members whose ONLY org is the one being wiped
// (and who are NOT protected system admins).
//
// Designed for pre-launch testing — lets the owner remove a test client
// completely so they can re-run the signup/onboarding flow with the same
// email address as if they had never existed.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "david@newuniformdesign.com";
// Never delete these users — they are system administrators across multiple orgs.
const PROTECTED_EMAILS = new Set<string>([
  "david@newuniformdesign.com",
  "annie@newuniformdesign.com",
]);

// All public.* tables that have an org_id column. Order doesn't really matter
// because we delete by org_id which never has FKs into other org_id rows of
// other tables — but children of leads / forms / sites need to be handled
// separately when their FK is the parent's id (no org_id of their own).
const ORG_SCOPED_TABLES = [
  // Tracking / analytics raw + derived
  "pageviews", "sessions", "events",
  "kpi_daily", "monthly_aggregates", "monthly_summaries", "nightly_summaries",
  "weekly_summaries", "traffic_daily", "conversions_daily",
  "ingestion_anomalies", "tracking_interruptions",
  "user_input_events", "user_activity_log",
  "site_visitors", "site_visitors_safe",

  // Forms / leads pipeline
  "lead_fields_flat", "lead_events_raw", "leads",
  "form_entries", "form_submission_logs", "form_health_checks",
  "form_import_jobs", "field_mappings", "form_integrations", "forms",

  // Goals / conversions
  "goal_completions", "conversion_goals", "goals_config", "goals",

  // Monitoring / health
  "broken_links", "incidents", "monitoring_alerts", "domain_health",
  "ssl_health", "tracker_alerts", "site_tracking_status",
  "site_wp_environment", "plugin_health_reports", "plugin_download_failures",
  "site_heartbeats",

  // Alerts / anomalies
  "alerts", "acquisition_metric_snapshots",

  // Reporting / exports / archives
  "report_runs", "report_schedules", "report_custom_templates",
  "saved_views", "archive_manifest", "export_jobs",
  "dashboard_snapshots", "ai_usage_log",

  // Sites + credentials
  "site_credentials", "site_ingest_tokens", "site_settings",
  "site_notification_rules", "credential_rotation_events",

  // Notifications / inbox
  "notification_inbox", "site_notification_rules",

  // Compliance / consent / customers
  "consent_config", "customer_profiles", "customer_contracts",
  "customer_health_snapshots", "onboarding_responses",

  // Security
  "security_findings", "security_alerts", "security_events",
  "security_release_checks", "security_audit_log",

  // Retention / lifecycle
  "retention_events", "retention_messages", "retention_account_health",
  "retention_account_flow_status",

  // SEO
  "seo_scans", "seo_fix_queue", "seo_fix_history",

  // Misc app
  "ad_spend", "api_keys", "invite_codes", "feedback",
  "admin_notes", "white_label_settings", "billing_recovery_events",
  "cancellation_feedback", "support_tickets", "subscription_status",
  "renewals", "orders", "order_items", "url_rules",
  "magic_login_tokens", "signed_request_nonces",
  "feature_requests", "backup_health",

  // Sites + membership LAST (parents of many of the above)
  "sites",
  "org_users",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is the owner.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const callerEmail = userData.user.email?.toLowerCase();
    if (callerEmail !== OWNER_EMAIL) {
      return json({ error: "Forbidden — owner only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action || "wipe";
    const admin = createClient(supabaseUrl, serviceKey);

    // ---- LIST MODE: return every org with member + site counts (owner-only) ----
    if (action === "list") {
      const { data: orgRows, error: lErr } = await admin
        .from("orgs")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });
      if (lErr) throw lErr;
      const ids = (orgRows ?? []).map((o: any) => o.id);
      if (ids.length === 0) return json({ ok: true, orgs: [] });

      const [{ data: mems }, { data: sts }, { data: profs }] = await Promise.all([
        admin.from("org_users").select("org_id, user_id").in("org_id", ids),
        admin.from("sites").select("org_id").in("org_id", ids),
        admin.from("profiles").select("user_id, email"),
      ]);
      const profMap = new Map<string, string>(
        (profs ?? []).map((p: any) => [p.user_id, p.email]),
      );
      const orgs = (orgRows ?? []).map((o: any) => {
        const orgMembers = (mems ?? []).filter((m: any) => m.org_id === o.id);
        const orgSites = (sts ?? []).filter((s: any) => s.org_id === o.id);
        return {
          id: o.id,
          name: o.name,
          created_at: o.created_at,
          member_count: orgMembers.length,
          site_count: orgSites.length,
          member_emails: orgMembers
            .map((m: any) => profMap.get(m.user_id) || "—")
            .filter(Boolean),
        };
      });
      return json({ ok: true, orgs });
    }

    const orgId: string | undefined = body?.orgId;
    const confirmName: string | undefined = body?.confirmName;
    if (!orgId) return json({ error: "Missing orgId" }, 400);

    // Verify org exists + name confirmation matches
    const { data: org, error: orgErr } = await admin
      .from("orgs").select("id, name").eq("id", orgId).maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) {
      // Already wiped — treat as success so the UI can refresh cleanly.
      return json({
        ok: true,
        org_name: confirmName || "(already removed)",
        org_id: orgId,
        report: { note: "Organization was already removed — nothing to do." },
        errors: [],
      });
    }

    if (typeof confirmName !== "string" || confirmName.trim() !== org.name) {
      return json({ error: "Confirmation name does not match organization name" }, 400);
    }

    const report: Record<string, number | string> = {};
    const errors: string[] = [];

    // 1. Capture all members + their emails (for subscriber/auth-user cleanup later).
    const { data: members } = await admin
      .from("org_users")
      .select("user_id")
      .eq("org_id", orgId);
    const memberUserIds = (members ?? []).map((m: any) => m.user_id);

    let memberEmails: string[] = [];
    if (memberUserIds.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id, email")
        .in("user_id", memberUserIds);
      memberEmails = (profs ?? [])
        .map((p: any) => (p.email || "").toLowerCase())
        .filter(Boolean);
    }
    report.member_count = memberUserIds.length;
    report.member_emails = memberEmails.join(", ") || "(none)";

    // 2. Delete all org-scoped data in chunks. Each RPC call deletes up to
    //    5,000 rows from a single table and returns whether more remain. This
    //    keeps every database statement well under the HTTP/edge timeout, so
    //    even very large organizations (10k+ leads, 40k+ lead_fields) wipe
    //    cleanly without "canceling statement due to statement timeout".
    const BATCH = 5000;
    const MAX_ITERS_PER_TABLE = 200; // 1M rows safety cap
    for (const tbl of ORG_SCOPED_TABLES) {
      let totalForTable = 0;
      let iter = 0;
      let lastRemaining = -1;
      while (iter < MAX_ITERS_PER_TABLE) {
        const { data: chunkRes, error: chunkErr } = await admin.rpc(
          "admin_wipe_org_chunk",
          { p_org_id: orgId, p_table: tbl, p_batch_size: BATCH },
        );
        if (chunkErr) {
          errors.push(`${tbl}: ${chunkErr.message}`);
          break;
        }
        const r = (chunkRes as any) || {};
        if (r.skipped) break;
        const deleted = Number(r.deleted || 0);
        const remaining = Number(r.remaining || 0);
        totalForTable += deleted;
        if (r.done || deleted === 0) break;
        // Safety: if remaining count is not decreasing, stop to avoid infinite loop.
        if (lastRemaining >= 0 && remaining >= lastRemaining) break;
        lastRemaining = remaining;
        iter += 1;
      }
      if (totalForTable > 0) report[`tbl_${tbl}`] = totalForTable;
    }

    // Finally drop the org record itself.
    const { data: orgDelRes, error: orgDelErr } = await admin.rpc(
      "admin_delete_org_record",
      { p_org_id: orgId },
    );
    if (orgDelErr) {
      errors.push(`orgs: ${orgDelErr.message}`);
    } else {
      report.tbl_orgs = Number((orgDelRes as any)?.deleted || 0);
    }

    // 4. For each member email: figure out which users have NO other org
    //    membership AND are not protected. Those get fully removed.
    let subscribersDeleted = 0;
    let profilesDeleted = 0;
    let authUsersDeleted = 0;
    const removedEmails: string[] = [];
    const keptEmails: string[] = [];

    for (const userId of memberUserIds) {
      // Does this user still belong to any other org?
      const { count: stillMember } = await admin
        .from("org_users")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId);

      const { data: prof } = await admin
        .from("profiles").select("email").eq("user_id", userId).maybeSingle();
      const email = (prof?.email || "").toLowerCase();

      if (PROTECTED_EMAILS.has(email)) {
        keptEmails.push(`${email} (protected admin)`);
        continue;
      }
      if ((stillMember ?? 0) > 0) {
        keptEmails.push(`${email} (still in another org)`);
        continue;
      }

      // Safe to fully remove this user.
      // a) subscribers row (keyed by email)
      if (email) {
        const { count: subCount } = await admin
          .from("subscribers").delete({ count: "exact" }).eq("email", email);
        subscribersDeleted += subCount ?? 0;

        // b) email_unsubscribe_tokens, email_send_log entries
        await admin.from("email_unsubscribe_tokens").delete().eq("email", email);
      }

      // c) user_roles
      await admin.from("user_roles").delete().eq("user_id", userId);

      // d) login_events (no org_id needed; per-user)
      await admin.from("login_events").delete().eq("user_id", userId);

      // e) user_notification_preferences
      await admin.from("user_notification_preferences").delete().eq("user_id", userId);

      // f) mfa codes
      await admin.from("mfa_email_codes").delete().eq("user_id", userId);

      // g) rate_limits
      await admin.from("rate_limits").delete().eq("user_id", userId);

      // h) profiles
      const { count: profCount } = await admin
        .from("profiles").delete({ count: "exact" }).eq("user_id", userId);
      profilesDeleted += profCount ?? 0;

      // i) auth.users (the actual login)
      const { error: authErr } = await admin.auth.admin.deleteUser(userId);
      if (authErr) {
        errors.push(`auth.users ${userId}: ${authErr.message}`);
      } else {
        authUsersDeleted += 1;
        removedEmails.push(email || userId);
      }
    }

    report.subscribers_deleted = subscribersDeleted;
    report.profiles_deleted = profilesDeleted;
    report.auth_users_deleted = authUsersDeleted;
    report.removed_users = removedEmails.join(", ") || "(none)";
    report.kept_users = keptEmails.join(", ") || "(none)";

    // 5. Audit (best-effort — deletion_audit may have org_id FK that cascaded;
    //    insert a generic record without referencing the now-gone org).
    await admin.from("deletion_audit").insert({
      org_id: orgId, // org is gone; the column has no FK constraint based on schema scan
      action: "admin_wipe_org",
      details: {
        deleted_by: callerEmail,
        org_name: org.name,
        report,
        errors,
      },
    }).select().maybeSingle();

    return json({
      ok: errors.length === 0,
      org_name: org.name,
      org_id: orgId,
      report,
      errors,
    });
  } catch (e: any) {
    console.error("[admin-wipe-org] error", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
