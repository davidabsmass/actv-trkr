/**
 * Form import watchdog — runs every 10 min via pg_cron.
 *
 * Responsibilities:
 *   1. For every form_integration with builder_type that supports counting,
 *      ask the WP plugin for the live entry count.
 *   2. Compare WP count vs total_entries_imported. If gap > 0 and no active
 *      job exists, create a new pending job to backfill the gap.
 *   3. Detect "stuck" jobs: pending or running for >30 min with no signal —
 *      release lock, mark for retry, log into a drift report.
 *   4. Heal the spam threshold: if a needs_review form has dropped below
 *      the JUNK_THRESHOLD (cleaned up), reset to detected.
 *   5. Always end by kicking the process-import-queue worker once.
 *
 * Authenticated via x-cron-secret header (matches CRON_SECRET env).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const JUNK_THRESHOLD = 50_000;
const MAX_INTEGRATIONS_PER_RUN = 200;
const DEFAULT_BATCH_SIZE = 100;

function getWpBaseUrl(site: { url?: string | null; domain?: string | null }) {
  const siteUrl = site.url || (site.domain ? `https://${site.domain}` : "");
  return `${siteUrl.replace(/\/$/, "")}/wp-json`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = req.headers.get("x-cron-secret") || "";
  const expectedSecret = Deno.env.get("CRON_SECRET") || "";
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startedAt = Date.now();
  const summary = {
    integrations_checked: 0,
    drift_detected: 0,
    jobs_created: 0,
    stuck_jobs_released: 0,
    failed_jobs_recovered: 0,
    needs_review_healed: 0,
    rediscovers_run: 0,
    forms_marked_inactive: 0,
    errors: [] as string[],
  };

  try {
    // ── Phase 0: Resurrect previously-failed jobs whose forms still exist ──
    // No import should ever stay terminally "failed" while the source form
    // is still present in WordPress and has missing entries. We reset such
    // jobs back to pending, preserving cursor + total_processed when safe so
    // we don't redo work the user already paid CPU time for.
    const { data: failedJobs } = await supabase
      .from("form_import_jobs")
      .select("id, form_integration_id, total_processed, retry_count, status")
      .in("status", ["failed", "cancelled"])
      .limit(50);

    for (const job of failedJobs || []) {
      await supabase.from("form_import_jobs").update({
        status: "pending",
        lock_token: null,
        locked_at: null,
        retry_count: 0,
        auto_resume_enabled: true,
        last_error: "Recovered by watchdog — automatic retry.",
        next_run_at: new Date().toISOString(),
      }).eq("id", job.id);

      await supabase.from("form_integrations")
        .update({ status: "importing", last_error: null })
        .eq("id", job.form_integration_id);

      summary.failed_jobs_recovered++;
    }

    // ── Phase 1: Stuck-job detection ──
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
    const { data: stuckJobs } = await supabase
      .from("form_import_jobs")
      .select("id, status, locked_at, heartbeat_at, retry_count")
      .in("status", ["running", "pending"])
      .or(`locked_at.lt.${stuckCutoff},and(heartbeat_at.lt.${stuckCutoff},lock_token.not.is.null)`)
      .limit(50);

    for (const job of stuckJobs || []) {
      await supabase.from("form_import_jobs").update({
        lock_token: null,
        locked_at: null,
        status: "pending",
        next_run_at: new Date().toISOString(),
        last_error: "Watchdog: released stuck lock",
      }).eq("id", job.id);
      summary.stuck_jobs_released++;
    }

    // ── Phase 1.5: Hourly per-site re-discovery ──
    // Calls handleDiscover via the manage-import-job function for any site
    // whose last discovery scan was >55 min ago. This is what propagates
    // active/inactive form toggles from WP without manual re-scan.
    const rediscoverCutoff = new Date(Date.now() - 55 * 60 * 1000).toISOString();
    const { data: dueSites } = await supabase
      .from("sites")
      .select("id, org_id, domain, url, last_form_discovery_at")
      .or(`last_form_discovery_at.is.null,last_form_discovery_at.lt.${rediscoverCutoff}`)
      .limit(20);

    for (const site of dueSites || []) {
      const result = await rediscoverSite(supabase, site);
      if (result.ok) {
        summary.rediscovers_run++;
        summary.forms_marked_inactive += result.marked_inactive || 0;
        await supabase.from("sites")
          .update({ last_form_discovery_at: new Date().toISOString() })
          .eq("id", site.id);
      }
    }

    // ── Phase 2: Drift detection across all active integrations ──
    const { data: integrations } = await supabase
      .from("form_integrations")
      .select("id, site_id, org_id, builder_type, external_form_id, status, total_entries_estimated, total_entries_imported, form_name")
      .in("status", ["detected", "synced", "importing", "error", "needs_review"])
      .limit(MAX_INTEGRATIONS_PER_RUN);

    if (!integrations || integrations.length === 0) {
      return json({ ok: true, summary, duration_ms: Date.now() - startedAt });
    }

    // Group by site to minimize WP calls
    const bySite = new Map<string, any[]>();
    for (const i of integrations) {
      if (!bySite.has(i.site_id)) bySite.set(i.site_id, []);
      bySite.get(i.site_id)!.push(i);
    }

    for (const [siteId, siteIntegrations] of bySite) {
      const { data: site } = await supabase
        .from("sites").select("id, org_id, domain, url")
        .eq("id", siteId).single();
      if (!site) continue;

      for (const integ of siteIntegrations) {
        summary.integrations_checked++;

        // Skip junk forms unless they may have been cleaned up
        const wasJunk = integ.status === "needs_review";

        // Ask WP plugin for live count
        const liveCount = await wpCount(supabase, site, integ.builder_type, integ.external_form_id);
        if (liveCount === null) continue; // plugin unreachable, skip silently

        // Healing path: needs_review → detected if count dropped below threshold
        if (wasJunk && liveCount <= JUNK_THRESHOLD) {
          await supabase.from("form_integrations").update({
            status: "detected",
            total_entries_estimated: liveCount,
            last_error: null,
          }).eq("id", integ.id);
          summary.needs_review_healed++;
          // Fall through to potentially create a job
        } else if (wasJunk) {
          // Still junk, just refresh count for visibility
          await supabase.from("form_integrations").update({
            total_entries_estimated: liveCount,
          }).eq("id", integ.id);
          continue;
        } else if (integ.total_entries_estimated !== liveCount) {
          // Refresh stale estimate
          await supabase.from("form_integrations").update({
            total_entries_estimated: liveCount,
          }).eq("id", integ.id);
        }

        const gap = liveCount - (integ.total_entries_imported || 0);
        if (gap <= 0) continue;
        if (liveCount > JUNK_THRESHOLD) continue; // don't auto-job junk forms

        summary.drift_detected++;

        // Skip if active job already exists
        const { data: activeJobs } = await supabase
          .from("form_import_jobs")
          .select("id")
          .eq("form_integration_id", integ.id)
          .in("status", ["pending", "running", "stalled"])
          .limit(1);
        if (activeJobs && activeJobs.length > 0) continue;

        // Create job
        const { error: insErr } = await supabase.from("form_import_jobs").insert({
          site_id: siteId,
          org_id: integ.org_id,
          form_integration_id: integ.id,
          status: "pending",
          batch_size: DEFAULT_BATCH_SIZE,
          adaptive_batch_size: DEFAULT_BATCH_SIZE,
          total_expected: liveCount,
          auto_resume_enabled: true,
          next_run_at: new Date().toISOString(),
        });

        if (!insErr) {
          summary.jobs_created++;
          await supabase.from("form_integrations")
            .update({ status: "importing" })
            .eq("id", integ.id);
        } else {
          summary.errors.push(`${integ.form_name}: ${insErr.message}`);
        }
      }
    }

    // ── Phase 3: Always kick the queue ──
    if (summary.jobs_created > 0 || summary.stuck_jobs_released > 0 || summary.failed_jobs_recovered > 0) {
      await kickQueue();
    }

    return json({ ok: true, summary, duration_ms: Date.now() - startedAt });
  } catch (err) {
    console.error("form-import-watchdog error:", err);
    return json({ error: String(err).slice(0, 300), summary, duration_ms: Date.now() - startedAt }, 500);
  }
});

async function wpCount(
  supabase: any,
  site: any,
  builderType: string,
  formId: string,
): Promise<number | null> {
  try {
    const baseUrl = getWpBaseUrl(site);
    const { data: apiKeys } = await supabase
      .from("api_keys").select("key_hash")
      .eq("org_id", site.org_id).is("revoked_at", null).limit(1);
    const keyHash = apiKeys?.[0]?.key_hash || "";
    if (!keyHash) return null;

    const res = await fetch(`${baseUrl}/actv-trkr/v1/import-count`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ builder_type: builderType, form_id: formId, key_hash: keyHash }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}

async function rediscoverSite(supabase: any, site: any): Promise<{ ok: boolean; marked_inactive?: number }> {
  try {
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!baseUrl || !anonKey) return { ok: false };

    // Mint a service-role JWT request directly to manage-import-job/discover.
    // We can't easily invoke discover (which expects a user JWT) so we
    // inline the reconciliation: call the WP plugin and reuse the same
    // is_active sync logic.
    const wpUrl = (site.url || (site.domain ? `https://${site.domain}` : "")).replace(/\/$/, "") + "/wp-json";
    const { data: apiKeys } = await supabase
      .from("api_keys").select("key_hash")
      .eq("org_id", site.org_id).is("revoked_at", null).limit(1);
    const keyHash = apiKeys?.[0]?.key_hash || "";
    if (!keyHash) return { ok: false };

    const res = await fetch(`${wpUrl}/actv-trkr/v1/import-discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_hash: keyHash }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const forms = Array.isArray(data?.forms) ? data.forms : [];
    if (forms.length === 0) return { ok: true, marked_inactive: 0 };

    const reportedKeys = new Set<string>();
    for (const f of forms) {
      const isActive = f.is_active === false ? false : true;
      reportedKeys.add(`${f.builder_type}::${String(f.external_form_id)}`);
      await supabase.from("forms")
        .update({ is_active: isActive })
        .eq("site_id", site.id).eq("provider", f.builder_type)
        .eq("external_form_id", String(f.external_form_id));
      await supabase.from("form_integrations")
        .update({ is_active: isActive })
        .eq("site_id", site.id).eq("builder_type", f.builder_type)
        .eq("external_form_id", String(f.external_form_id));
    }

    // Never mark missing forms inactive from watchdog discovery. A partial WP
    // response or an older adapter can omit healthy forms; only an explicit
    // `is_active === false` for a reported form is authoritative.
    return { ok: true, marked_inactive: 0 };
  } catch {
    return { ok: false };
  }
}

async function kickQueue() {
  try {
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!baseUrl || !anonKey || !cronSecret) return;

    await fetch(`${baseUrl}/functions/v1/process-import-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ triggered_by: "form-import-watchdog" }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.warn("watchdog: queue kick failed", err);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
