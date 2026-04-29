/**
 * Import job orchestrator.
 * Manages the lifecycle of form import jobs:
 * - Discover, create, process, resume, restart, cancel, status, list, preflight
 * - Locking, adaptive batch sizing, stall detection
 *
 * Uses existing ingest-form-batch for actual data ingestion.
 * Respects ingestion-security.ts via the ingest-form-batch call chain.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = Number.POSITIVE_INFINITY; // never give up — watchdog handles unrecoverable cases
const MAX_BACKOFF_MS = 10 * 60 * 1000;
const MIN_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 250;
const DEFAULT_BATCH_SIZE = 100;

// Oversized form safety: forms above JUNK_THRESHOLD are imported newest-first
// and capped at IMPORT_CAP entries (see process-import-queue for batch logic).
const JUNK_THRESHOLD = 50_000;
const IMPORT_CAP = 8_000;

function getWpBaseUrl(site: { url?: string | null; domain?: string | null }) {
  const siteUrl = site.url || (site.domain ? `https://${site.domain}` : "");
  return `${siteUrl.replace(/\/$/, "")}/wp-json`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "discover": return await handleDiscover(supabase, user, req);
      case "create": return await handleCreate(supabase, user, req);
      case "process": return await handleProcess(supabase, user, req);
      case "resume": return await handleResume(supabase, user, req);
      case "restart": return await handleRestart(supabase, user, req);
      case "pause": return await handlePause(supabase, user, req);
      case "cancel": return await handleCancel(supabase, user, req);
      case "preflight": return await handlePreflight(supabase, user, req);
      case "status": return await handleStatus(supabase, user, req);
      case "list": return await handleList(supabase, user, req);
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("manage-import-job error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

// ── Pre-flight validation ──
async function handlePreflight(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const siteId = body.site_id;
  if (!siteId) return json({ error: "Missing site_id" }, 400);

  const site = await getSiteForUser(supabase, user.id, siteId);
  if (!site) return json({ error: "Site not found" }, 404);

  const checks: any = { site_found: true, errors: [], warnings: [] };

  const baseUrl = getWpBaseUrl(site);
  checks.wp_rest_url = baseUrl;

  try {
    const res = await fetch(`${baseUrl}/actv-trkr/v1/import-discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_hash: await getKeyHash(supabase, site.org_id) }),
      signal: AbortSignal.timeout(15_000),
    });
    checks.plugin_reachable = res.ok;
    if (!res.ok) {
      checks.errors.push(`Plugin endpoint returned HTTP ${res.status}`);
    }
  } catch (err) {
    checks.plugin_reachable = false;
    checks.errors.push(`Cannot reach plugin: ${String(err).slice(0, 100)}`);
  }

  checks.ready = checks.errors.length === 0;
  return json({ ok: true, preflight: checks });
}

// ── Discover forms on WP site ──
// Strategy:
//   1. Try the WP plugin's import-discover endpoint (authoritative source).
//   2. If it fails (timeout / 5xx / unreachable) OR returns 0 forms,
//      fall back to backfilling form_integrations from any forms already
//      recorded in the `forms` table (populated by site-sync / tracker).
//   This guarantees the Settings UI never shows "0 forms" when forms
//   already exist in the database.
async function handleDiscover(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const siteId = body.site_id;
  if (!siteId) return json({ error: "Missing site_id" }, 400);

  const site = await getSiteForUser(supabase, user.id, siteId);
  if (!site) return json({ error: "Site not found" }, 404);

  let source: "wp_plugin" | "forms_table" = "wp_plugin";
  let wpError: string | null = null;
  let forms: any[] = [];

  const wpResult = await callWpPlugin(supabase, site, "import-discover", {});
  if (wpResult.ok && Array.isArray(wpResult.forms) && wpResult.forms.length > 0) {
    forms = wpResult.forms;
  } else {
    wpError = wpResult.ok ? null : (wpResult.error || "WP plugin unreachable");
    // ── Fallback: backfill from existing forms table ──
    const { data: existing } = await supabase
      .from("forms")
      .select("provider, external_form_id, name, page_url")
      .eq("site_id", siteId)
      .eq("archived", false);

    if (existing && existing.length > 0) {
      source = "forms_table";
      forms = existing.map((f: any) => ({
        builder_type: f.provider || "gravity_forms",
        external_form_id: f.external_form_id,
        form_name: f.name || `Form ${f.external_form_id}`,
        entry_count: 0, // unknown without WP plugin
      }));
    }
  }

  // Upsert form_integrations and auto-create import jobs for any form with
  // entries that haven't been fully imported yet. This makes "Re-scan" a
  // one-click "discover + import" action — users no longer need to click
  // "Start Import" on each form individually.
  let autoStartedJobs = 0;
  let skippedJobs = 0;

  // Junk-form guard: forms above JUNK_THRESHOLD are spam-bombed; we register
  // them but skip auto-import (manual force-import will use the capped path).
  let junkSkipped = 0;

  forms = Array.from(new Map(forms.map((form: any) => [
    `${form.builder_type || "unknown"}::${String(form.external_form_id || "")}`,
    form,
  ])).values());

  // Track which (provider, external_form_id) pairs the plugin reported in this
  // scan. Anything previously known but missing must be marked inactive
  // (deleted in WP). Only safe to do when source === "wp_plugin" — fallback
  // path doesn't have authoritative knowledge.
  const reportedKeys = new Set<string>();
  const reportedExternalIds = new Set<string>();

  for (const form of forms) {
    let estimated = form.entry_count || 0;
    const isJunk = estimated > JUNK_THRESHOLD;
    if (isJunk) {
      junkSkipped++;
      // Record real count for visibility but treat as 0 for auto-import.
      estimated = 0;
    }

    // Default to true for older plugins that don't send is_active yet.
    const isActive = form.is_active === false ? false : true;

    reportedKeys.add(`${form.builder_type}::${String(form.external_form_id)}`);
    reportedExternalIds.add(String(form.external_form_id));

    // Upsert integration. CRITICAL: also overwrite org_id on conflict so a
    // site that was re-assigned to a new org gets its form_integrations
    // re-linked to the current owner.
    const { data: integration } = await supabase
      .from("form_integrations")
      .upsert({
        site_id: siteId,
        org_id: site.org_id,
        builder_type: form.builder_type,
        external_form_id: form.external_form_id,
        form_name: form.form_name,
        is_active: isActive,
        total_entries_estimated: isJunk ? form.entry_count : estimated,
        status: isJunk ? "needs_review" : "detected",
        last_error: isJunk ? `Reported ${form.entry_count} entries — exceeds safety threshold of ${JUNK_THRESHOLD}; manual import required` : null,
      }, { onConflict: "site_id,builder_type,external_form_id" })
      .select("id, total_entries_imported, status")
      .single();

    if (!integration) continue;

    // Also sync is_active and (when WP gave us a real, non-stub title)
    // overwrite the forms.name on the corresponding row. This heals any
    // form whose name was first created by the realtime ingest stub
    // ("Form (<provider>)") before the WP plugin could supply the real
    // title.
    const wpTitle = typeof form.form_name === "string" ? form.form_name.trim() : "";
    const isRealTitle =
      source === "wp_plugin" &&
      wpTitle.length > 0 &&
      wpTitle !== `Form (${form.builder_type})` &&
      !/^Form \d+$/.test(wpTitle);

    const formsUpdate: Record<string, unknown> = { is_active: isActive };
    if (isRealTitle) formsUpdate.name = wpTitle;

    await supabase
      .from("forms")
      .update(formsUpdate)
      .eq("site_id", siteId)
      .eq("provider", form.builder_type)
      .eq("external_form_id", String(form.external_form_id));

    // Additionally, if the integration row itself still holds a stub
    // name (because the form was first observed via realtime ingest),
    // upgrade it now that we have the authoritative WP title.
    if (isRealTitle) {
      await supabase
        .from("form_integrations")
        .update({ form_name: wpTitle })
        .eq("id", integration.id)
        .or(`form_name.eq.Form (${form.builder_type}),form_name.is.null`);
    }

    // Skip auto-import when:
    //  - form is inactive in WP (don't auto-import disabled forms), or
    //  - form has no entries to import, or
    //  - it's already fully synced, or
    //  - source was the forms-table fallback (no real count, would create a
    //    junk job for every form), or
    //  - an active job already exists.
    if (!isActive) { skippedJobs++; continue; }
    if (estimated === 0) { skippedJobs++; continue; }
    if (source === "forms_table") { skippedJobs++; continue; }
    if ((integration.total_entries_imported || 0) >= estimated) { skippedJobs++; continue; }

    const { data: existingJobs } = await supabase
      .from("form_import_jobs")
      .select("id")
      .eq("form_integration_id", integration.id)
      .in("status", ["pending", "running", "stalled"])
      .limit(1);

    if (existingJobs && existingJobs.length > 0) { skippedJobs++; continue; }

    const { error: jobErr } = await supabase
      .from("form_import_jobs")
      .insert({
        site_id: siteId,
        org_id: site.org_id,
        form_integration_id: integration.id,
        status: "pending",
        batch_size: DEFAULT_BATCH_SIZE,
        adaptive_batch_size: DEFAULT_BATCH_SIZE,
        total_expected: estimated,
        auto_resume_enabled: true,
        next_run_at: new Date().toISOString(),
      });

    if (!jobErr) {
      await supabase.from("form_integrations")
        .update({ status: "importing" })
        .eq("id", integration.id);
      autoStartedJobs++;
    }
  }

  // ── Reconciliation: handle forms EXPLICITLY disabled in WP ──
  //
  // PRIOR BEHAVIOR (removed): if the plugin's discover payload didn't include
  // a form, we marked it inactive. That was destructive — a partial/paged
  // response, a builder adapter skipping a form, or any transient WP glitch
  // could silently hide healthy forms from the user's "Active" tab right
  // after they clicked "Sync".
  //
  // NEW BEHAVIOR: deactivation only happens when the plugin EXPLICITLY tells
  // us a form is disabled (form.is_active === false in the discover payload).
  // That's already handled per-form in the upsert loop above. Re-scan is now
  // strictly additive — it can only ADD or UPDATE forms, never silently HIDE
  // a form just because it wasn't in this scan's payload.
  const markedInactive = 0;

  const queueTriggered = autoStartedJobs > 0
    ? await triggerQueueProcessor()
    : false;

  return json({
    ok: true,
    discovered: forms.length,
    auto_started_jobs: autoStartedJobs,
    skipped_jobs: skippedJobs,
    junk_skipped: junkSkipped,
    marked_inactive: markedInactive,
    source,
    wp_plugin_error: wpError,
    queue_triggered: queueTriggered,
    forms,
  });
}

// ── Create import job ──
async function handleCreate(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const integrationId = body.form_integration_id;
  if (!integrationId) return json({ error: "Missing form_integration_id" }, 400);

  const { data: integration } = await supabase
    .from("form_integrations").select("*").eq("id", integrationId).single();
  if (!integration) return json({ error: "Integration not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, integration.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  // Check for existing active job
  const { data: existingJobs } = await supabase
    .from("form_import_jobs").select("id, status")
    .eq("form_integration_id", integrationId)
    .in("status", ["pending", "running", "stalled"]);

  if (existingJobs && existingJobs.length > 0) {
    return json({ error: "An import job is already active for this form", job_id: existingJobs[0].id }, 409);
  }

  // Get count from WP
  const wpCount = await callWpPlugin(supabase, site, "import-count", {
    builder_type: integration.builder_type,
    form_id: integration.external_form_id,
  });

  const actualCount = wpCount?.count ?? integration.total_entries_estimated ?? 0;

  // Cap-aware total_expected: oversized forms only import the most recent
  // IMPORT_CAP entries, so progress bars should reflect that — not 8K of 755K.
  const isCapped = actualCount > JUNK_THRESHOLD;
  const totalExpected = isCapped ? Math.min(IMPORT_CAP, actualCount) : actualCount;
  const batchSize = Math.min(body.batch_size || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);

  const { data: job, error } = await supabase
    .from("form_import_jobs")
    .insert({
      site_id: integration.site_id,
      org_id: integration.org_id,
      form_integration_id: integrationId,
      status: "pending",
      batch_size: batchSize,
      adaptive_batch_size: batchSize,
      total_expected: totalExpected,
      auto_resume_enabled: true,
      next_run_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // Preserve real estimate for display; just flip to importing.
  await supabase.from("form_integrations")
    .update({
      status: "importing",
      total_entries_estimated: actualCount,
      last_error: isCapped ? `Capped import — most-recent ${IMPORT_CAP.toLocaleString()} of ${actualCount.toLocaleString()}` : null,
    })
    .eq("id", integrationId);

  const queueTriggered = await triggerQueueProcessor();

  return json({ ok: true, job, queue_triggered: queueTriggered });
}

// ── Process next batch (UI-triggered, still supported) ──
async function handleProcess(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const jobId = body.job_id;
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase
    .from("form_import_jobs")
    .select("*, form_integrations(*)")
    .eq("id", jobId).single();

  if (!job) return json({ error: "Job not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, job.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return json({ error: `Job already ${job.status}` }, 400);
  }

  const integration = job.form_integrations;
  const batchSize = job.adaptive_batch_size || job.batch_size || DEFAULT_BATCH_SIZE;

  // Update to running with signal
  await supabase.from("form_import_jobs").update({
    status: "running",
    heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId);

  const wpResult = await callWpPlugin(supabase, site, "import-batch", {
    builder_type: integration.builder_type,
    form_id: integration.external_form_id,
    cursor: job.cursor,
    batch_size: batchSize,
  });

  if (!wpResult.ok) {
    const retryCount = (job.retry_count || 0) + 1;
    const newBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(batchSize * 0.5));
    const backoffMs = Math.min(MAX_BACKOFF_MS, 2000 * Math.pow(2, Math.min(retryCount, 10)));

    await supabase.from("form_import_jobs").update({
      retry_count: retryCount,
      last_error: wpResult.error || "WP plugin error",
      status: "pending", // never go terminal here — auto-retry
      adaptive_batch_size: newBatchSize,
      next_run_at: new Date(Date.now() + backoffMs).toISOString(),
      lock_token: null,
      locked_at: null,
      auto_resume_enabled: true,
    }).eq("id", jobId);

    // Keep integration in importing — recovery is automatic.
    await supabase.from("form_integrations")
      .update({ status: "importing" })
      .eq("id", integration.id);

    return json({ error: wpResult.error, retry_count: retryCount, status: "pending", adaptive_batch_size: newBatchSize, next_run_in_ms: backoffMs }, 502);
  }

  const processed = wpResult.processed || 0;
  const totalProcessed = (job.total_processed || 0) + processed;
  const hasMore = wpResult.has_more === true;
  const nextCursor = wpResult.next_cursor || null;
  const newStatus = hasMore ? "pending" : "completed";
  const successBatchSize = Math.min(MAX_BATCH_SIZE, batchSize + 10);

  await supabase.from("form_import_jobs").update({
    cursor: nextCursor,
    total_processed: totalProcessed,
    last_batch_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    retry_count: 0,
    last_error: null,
    status: newStatus,
    adaptive_batch_size: successBatchSize,
    next_run_at: hasMore ? new Date(Date.now() + 2_000).toISOString() : null,
    lock_token: null,
    locked_at: null,
  }).eq("id", jobId);

  const integrationUpdate: any = { total_entries_imported: totalProcessed };
  if (!hasMore) {
    integrationUpdate.status = "synced";
    integrationUpdate.last_synced_at = new Date().toISOString();
    integrationUpdate.last_error = null;
  }
  await supabase.from("form_integrations").update(integrationUpdate).eq("id", integration.id);

  return json({
    ok: true, processed, total_processed: totalProcessed,
    has_more: hasMore, next_cursor: nextCursor, status: newStatus,
    adaptive_batch_size: successBatchSize,
  });
}

// ── Pause ──
async function handlePause(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const jobId = body.job_id;
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase.from("form_import_jobs").select("*").eq("id", jobId).single();
  if (!job) return json({ error: "Job not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, job.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  await supabase.from("form_import_jobs").update({
    status: "paused",
    auto_resume_enabled: false,
    lock_token: null,
    locked_at: null,
  }).eq("id", jobId);

  return json({ ok: true, status: "paused" });
}

// ── Cancel ──
async function handleCancel(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const jobId = body.job_id;
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase.from("form_import_jobs").select("*").eq("id", jobId).single();
  if (!job) return json({ error: "Job not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, job.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  if (job.lock_token) {
    // Job is actively being processed, request cancellation
    await supabase.from("form_import_jobs").update({
      status: "cancel_requested",
      cancel_reason: body.reason || "Cancelled by user",
    }).eq("id", jobId);
  } else {
    await supabase.from("form_import_jobs").update({
      status: "cancelled",
      cancel_reason: body.reason || "Cancelled by user",
      lock_token: null,
      locked_at: null,
    }).eq("id", jobId);
  }

  return json({ ok: true, status: job.lock_token ? "cancel_requested" : "cancelled" });
}

// ── Resume ──
async function handleResume(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const jobId = body.job_id;
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase.from("form_import_jobs").select("*").eq("id", jobId).single();
  if (!job) return json({ error: "Job not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, job.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  await supabase.from("form_import_jobs").update({
    status: "pending",
    retry_count: 0,
    last_error: null,
    auto_resume_enabled: true,
    next_run_at: new Date().toISOString(),
    lock_token: null,
    locked_at: null,
  }).eq("id", jobId);

  await supabase.from("form_integrations").update({ status: "importing" }).eq("id", job.form_integration_id);

  const queueTriggered = await triggerQueueProcessor();

  return json({ ok: true, status: "pending", queue_triggered: queueTriggered });
}

// ── Restart ──
async function handleRestart(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const jobId = body.job_id;
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase.from("form_import_jobs").select("*").eq("id", jobId).single();
  if (!job) return json({ error: "Job not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, job.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  await supabase.from("form_import_jobs").update({
    status: "pending",
    cursor: null,
    total_processed: 0,
    retry_count: 0,
    last_error: null,
    last_batch_at: null,
    adaptive_batch_size: job.batch_size || DEFAULT_BATCH_SIZE,
    auto_resume_enabled: true,
    next_run_at: new Date().toISOString(),
    lock_token: null,
    locked_at: null,
    cancel_reason: null,
  }).eq("id", jobId);

  await supabase.from("form_integrations")
    .update({ status: "importing", total_entries_imported: 0 })
    .eq("id", job.form_integration_id);

  const queueTriggered = await triggerQueueProcessor();

  return json({ ok: true, status: "pending", queue_triggered: queueTriggered });
}

// ── Status ──
async function handleStatus(supabase: any, user: any, req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase
    .from("form_import_jobs")
    .select("*, form_integrations(*)")
    .eq("id", jobId).single();

  if (!job) return json({ error: "Job not found" }, 404);

  // Derive health
  const health = deriveJobHealth(job);

  return json({ ok: true, job, health });
}

// ── List ──
async function handleList(supabase: any, user: any, req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org_id");
  if (!orgId) return json({ error: "Missing org_id" }, 400);

  const { data: membership } = await supabase
    .from("org_users").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();

  if (!membership) return json({ error: "Access denied" }, 403);

  const { data: integrations } = await supabase
    .from("form_integrations")
    .select("*, form_import_jobs(*)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return json({ ok: true, integrations: integrations || [] });
}

// ── Helpers ──

function deriveJobHealth(job: any): string {
  if (job.status === "completed") return "completed";
  if (job.status === "failed" || job.status === "cancelled") return "failed";
  if (job.status === "stalled") return "stalled";
  if (job.status === "paused") return "paused";
  if ((job.retry_count || 0) > 0) return "retrying";
  return "healthy";
}

async function getSiteForUser(supabase: any, userId: string, siteId: string) {
  const { data: site } = await supabase
    .from("sites").select("id, org_id, domain, url")
    .eq("id", siteId).single();

  if (!site) return null;

  const { data: membership } = await supabase
    .from("org_users").select("role")
    .eq("org_id", site.org_id).eq("user_id", userId).single();

  if (!membership) return null;
  return site;
}

async function getKeyHash(supabase: any, orgId: string): Promise<string> {
  const { data: apiKeys } = await supabase
    .from("api_keys").select("key_hash")
    .eq("org_id", orgId).is("revoked_at", null).limit(1);
  return apiKeys?.[0]?.key_hash || "";
}

async function callWpPlugin(supabase: any, site: any, route: string, body: any): Promise<any> {
  const baseUrl = getWpBaseUrl(site);
  const keyHash = await getKeyHash(supabase, site.org_id);

  try {
    const res = await fetch(`${baseUrl}/actv-trkr/v1/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, key_hash: keyHash }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 200) };
  }
}

async function triggerQueueProcessor(): Promise<boolean> {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!baseUrl || !anonKey || !cronSecret) {
    console.warn("manage-import-job: queue trigger skipped due to missing env");
    return false;
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/process-import-queue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ triggered_by: "manage-import-job", triggered_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`manage-import-job: queue trigger failed with HTTP ${res.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("manage-import-job: queue trigger failed", error);
    return false;
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
