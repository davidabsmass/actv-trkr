// Security finding auto-generators (cron-driven).
// Scans each org and upserts findings for:
//   - stale_backup       (last_backup_at > 7d or missing)
//   - restore_test_missing (last_restore_test_at > 90d or missing)
//   - webhook_verification_disabled (>5 invalid/replay webhook events in 7d)
//   - suspicious_activity (>20 auth failures in 24h for org's users)
// Idempotent: if an open finding of (org_id, type) exists, it is updated, not duplicated.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Severity = "low" | "medium" | "high" | "critical";

interface FindingSeed {
  org_id: string;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  recommended_fix: string;
  source: string;
  metadata: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Cron auth: allow either the project CRON_SECRET header, or service-role bearer.
    const cronSecret = req.headers.get("x-cron-secret");
    const expected = Deno.env.get("CRON_SECRET");
    if (expected && cronSecret !== expected) {
      // Allow service-role calls too
      const auth = req.headers.get("authorization") || "";
      if (!auth.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "___nope___")) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: orgs, error: orgsErr } = await supabase
      .from("orgs")
      .select("id, name");
    if (orgsErr) throw orgsErr;

    const seeds: FindingSeed[] = [];
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Webhook verification failures (global table — attribute to all orgs only when they have any webhook activity).
    const { count: webhookFailCount } = await supabase
      .from("webhook_verification_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo)
      .in("verification_status", ["signature_invalid", "replay_rejected"]);

    for (const org of orgs ?? []) {
      const orgId = org.id as string;

      // 1) Stale backup
      const { data: bh } = await supabase
        .from("backup_health")
        .select("last_backup_at, last_restore_test_at")
        .eq("org_id", orgId)
        .maybeSingle();

      const lastBackup = bh?.last_backup_at ? new Date(bh.last_backup_at as string).getTime() : 0;
      if (!lastBackup || lastBackup < now - 7 * 24 * 60 * 60 * 1000) {
        seeds.push({
          org_id: orgId,
          type: "stale_backup",
          severity: "high",
          title: "Backup is stale or missing",
          description: lastBackup
            ? `Last backup recorded ${new Date(lastBackup).toISOString().slice(0, 10)} — older than 7 days.`
            : "No backup has been recorded for this organization.",
          recommended_fix: "Run a fresh backup and confirm the system records last_backup_at on backup_health.",
          source: "auto:backup_health",
          metadata: { last_backup_at: bh?.last_backup_at ?? null },
        });
      }

      const lastRestore = bh?.last_restore_test_at ? new Date(bh.last_restore_test_at as string).getTime() : 0;
      if (!lastRestore || lastRestore < now - 90 * 24 * 60 * 60 * 1000) {
        seeds.push({
          org_id: orgId,
          type: "restore_test_missing",
          severity: "medium",
          title: "Restore test is stale or missing",
          description: lastRestore
            ? `Last restore test ran ${new Date(lastRestore).toISOString().slice(0, 10)} — older than 90 days.`
            : "No restore test has been recorded.",
          recommended_fix: "Perform a restore-from-backup test to confirm backups are usable, then update last_restore_test_at.",
          source: "auto:backup_health",
          metadata: { last_restore_test_at: bh?.last_restore_test_at ?? null },
        });
      }

      // 2) Webhook verification (only if global rejections > 5)
      if ((webhookFailCount ?? 0) > 5) {
        seeds.push({
          org_id: orgId,
          type: "webhook_verification_disabled",
          severity: "high",
          title: "Webhook verification rejecting requests",
          description: `${webhookFailCount} webhook signatures failed verification in the last 7 days across the platform. Confirm signing secrets are configured for this org's integrations.`,
          recommended_fix: "Rotate webhook signing secrets and confirm every webhook source uses the current secret.",
          source: "auto:webhook_verification_log",
          metadata: { failures_7d: webhookFailCount },
        });
      }

      // 3) Repeated auth failures for this org's users
      const { data: members } = await supabase
        .from("org_users")
        .select("user_id")
        .eq("org_id", orgId);

      const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const { count: authFails } = await supabase
          .from("security_audit_log")
          .select("id", { count: "exact", head: true })
          .gte("occurred_at", oneDayAgo)
          .eq("event_type", "auth_failure")
          .in("user_id", userIds);

        if ((authFails ?? 0) > 20) {
          seeds.push({
            org_id: orgId,
            type: "suspicious_activity",
            severity: "high",
            title: "Repeated authentication failures detected",
            description: `${authFails} failed auth attempts in the last 24 hours for users in this org.`,
            recommended_fix: "Review the Events tab, confirm targeted accounts are safe, and require password resets if needed.",
            source: "auto:security_audit_log",
            metadata: { failures_24h: authFails, window: "24h" },
          });
        }
      }
    }

    // Upsert: for each seed, if an OPEN finding of (org_id, type) exists, refresh metadata + updated_at.
    // Otherwise insert a new one.
    let inserted = 0;
    let refreshed = 0;
    for (const seed of seeds) {
      const { data: existing } = await supabase
        .from("security_findings")
        .select("id")
        .eq("org_id", seed.org_id)
        .eq("type", seed.type)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("security_findings")
          .update({
            severity: seed.severity,
            title: seed.title,
            description: seed.description,
            recommended_fix: seed.recommended_fix,
            metadata: seed.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        refreshed++;
      } else {
        const { error: insErr } = await supabase.from("security_findings").insert({
          org_id: seed.org_id,
          type: seed.type,
          severity: seed.severity,
          title: seed.title,
          description: seed.description,
          recommended_fix: seed.recommended_fix,
          source: seed.source,
          metadata: seed.metadata,
          status: "open",
        });
        if (!insErr) inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned_orgs: orgs?.length ?? 0,
        candidate_findings: seeds.length,
        inserted,
        refreshed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("security-auto-generate-findings error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
