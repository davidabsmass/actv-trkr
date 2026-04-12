/**
 * Import job orchestrator.
 * Manages the lifecycle of form import jobs:
 * - Create jobs
 * - Process next batch (calls WP plugin, updates cursor)
 * - Resume / restart jobs
 * - Query job status
 *
 * Uses existing ingest-form-batch for actual data ingestion.
 * Respects ingestion-security.ts via the ingest-form-batch call chain.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES = 10;
const BACKOFF_BASE_MS = 2000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth: require logged-in user
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "discover":
        return await handleDiscover(supabase, user, req);
      case "create":
        return await handleCreate(supabase, user, req);
      case "process":
        return await handleProcess(supabase, user, req);
      case "resume":
        return await handleResume(supabase, user, req);
      case "restart":
        return await handleRestart(supabase, user, req);
      case "status":
        return await handleStatus(supabase, user, req);
      case "list":
        return await handleList(supabase, user, req);
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("manage-import-job error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

// ── Discover forms on WP site ──
async function handleDiscover(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const siteId = body.site_id;
  if (!siteId) return json({ error: "Missing site_id" }, 400);

  const site = await getSiteForUser(supabase, user.id, siteId);
  if (!site) return json({ error: "Site not found" }, 404);

  // Call WP plugin discover endpoint
  const wpResult = await callWpPlugin(site, "import-discover", {});
  if (!wpResult.ok) return json({ error: wpResult.error || "WP plugin unreachable" }, 502);

  const forms = wpResult.forms || [];

  // Upsert form_integrations
  for (const form of forms) {
    await supabase.from("form_integrations").upsert({
      site_id: siteId,
      org_id: site.org_id,
      builder_type: form.builder_type,
      external_form_id: form.external_form_id,
      form_name: form.form_name,
      total_entries_estimated: form.entry_count || 0,
      status: "detected",
    }, { onConflict: "site_id,builder_type,external_form_id" });
  }

  return json({ ok: true, discovered: forms.length, forms });
}

// ── Create import job ──
async function handleCreate(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const integrationId = body.form_integration_id;
  if (!integrationId) return json({ error: "Missing form_integration_id" }, 400);

  const { data: integration } = await supabase
    .from("form_integrations")
    .select("*")
    .eq("id", integrationId)
    .single();

  if (!integration) return json({ error: "Integration not found" }, 404);

  // Verify user access
  const site = await getSiteForUser(supabase, user.id, integration.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  // Check for existing running job
  const { data: existingJobs } = await supabase
    .from("form_import_jobs")
    .select("id, status")
    .eq("form_integration_id", integrationId)
    .in("status", ["pending", "running"]);

  if (existingJobs && existingJobs.length > 0) {
    return json({ error: "An import job is already active for this form", job_id: existingJobs[0].id }, 409);
  }

  // Get count from WP
  const wpCount = await callWpPlugin(site, "import-count", {
    builder_type: integration.builder_type,
    form_id: integration.external_form_id,
  });

  const totalExpected = wpCount?.count ?? integration.total_entries_estimated;

  // Create job
  const { data: job, error } = await supabase
    .from("form_import_jobs")
    .insert({
      site_id: integration.site_id,
      org_id: integration.org_id,
      form_integration_id: integrationId,
      status: "pending",
      batch_size: Math.min(body.batch_size || 100, 250),
      total_expected: totalExpected,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  // Update integration status
  await supabase
    .from("form_integrations")
    .update({ status: "importing", total_entries_estimated: totalExpected })
    .eq("id", integrationId);

  return json({ ok: true, job });
}

// ── Process next batch ──
async function handleProcess(supabase: any, user: any, req: Request) {
  const body = await req.json();
  const jobId = body.job_id;
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase
    .from("form_import_jobs")
    .select("*, form_integrations(*)")
    .eq("id", jobId)
    .single();

  if (!job) return json({ error: "Job not found" }, 404);

  const site = await getSiteForUser(supabase, user.id, job.site_id);
  if (!site) return json({ error: "Access denied" }, 403);

  if (job.status === "completed" || job.status === "failed") {
    return json({ error: `Job already ${job.status}` }, 400);
  }

  const integration = job.form_integrations;

  // Update job to running
  await supabase
    .from("form_import_jobs")
    .update({ status: "running" })
    .eq("id", jobId);

  // Call WP plugin for next batch
  const wpResult = await callWpPlugin(site, "import-batch", {
    builder_type: integration.builder_type,
    form_id: integration.external_form_id,
    cursor: job.cursor,
    batch_size: job.batch_size,
  });

  if (!wpResult.ok) {
    const retryCount = job.retry_count + 1;
    const newStatus = retryCount >= MAX_RETRIES ? "failed" : "pending";

    await supabase.from("form_import_jobs").update({
      retry_count: retryCount,
      last_error: wpResult.error || "WP plugin error",
      status: newStatus,
    }).eq("id", jobId);

    if (newStatus === "failed") {
      await supabase.from("form_integrations")
        .update({ status: "error", last_error: wpResult.error })
        .eq("id", integration.id);
    }

    return json({ error: wpResult.error, retry_count: retryCount, status: newStatus }, 502);
  }

  const processed = wpResult.processed || 0;
  const totalProcessed = job.total_processed + processed;
  const hasMore = wpResult.has_more === true;
  const nextCursor = wpResult.next_cursor || null;

  // Upsert form_entries for idempotency tracking
  // (The actual lead creation happens in ingest-form-batch already)

  const newStatus = hasMore ? "running" : "completed";

  await supabase.from("form_import_jobs").update({
    cursor: nextCursor,
    total_processed: totalProcessed,
    last_batch_at: new Date().toISOString(),
    retry_count: 0, // reset on success
    last_error: null,
    status: newStatus,
  }).eq("id", jobId);

  // Update integration
  const integrationUpdate: any = {
    total_entries_imported: totalProcessed,
  };
  if (!hasMore) {
    integrationUpdate.status = "synced";
    integrationUpdate.last_synced_at = new Date().toISOString();
  }
  await supabase.from("form_integrations")
    .update(integrationUpdate)
    .eq("id", integration.id);

  return json({
    ok: true,
    processed,
    total_processed: totalProcessed,
    has_more: hasMore,
    next_cursor: nextCursor,
    status: newStatus,
  });
}

// ── Resume a paused/failed job ──
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
  }).eq("id", jobId);

  await supabase.from("form_integrations").update({ status: "importing" }).eq("id", job.form_integration_id);

  return json({ ok: true, status: "pending" });
}

// ── Restart a job from scratch ──
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
  }).eq("id", jobId);

  await supabase.from("form_integrations").update({ status: "importing", total_entries_imported: 0 }).eq("id", job.form_integration_id);

  return json({ ok: true, status: "pending" });
}

// ── Get job status ──
async function handleStatus(supabase: any, user: any, req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return json({ error: "Missing job_id" }, 400);

  const { data: job } = await supabase
    .from("form_import_jobs")
    .select("*, form_integrations(*)")
    .eq("id", jobId)
    .single();

  if (!job) return json({ error: "Job not found" }, 404);
  return json({ ok: true, job });
}

// ── List integrations and jobs for a site ──
async function handleList(supabase: any, user: any, req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org_id");
  if (!orgId) return json({ error: "Missing org_id" }, 400);

  // Verify membership
  const { data: membership } = await supabase
    .from("org_users")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!membership) return json({ error: "Access denied" }, 403);

  const { data: integrations } = await supabase
    .from("form_integrations")
    .select("*, form_import_jobs(*)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return json({ ok: true, integrations: integrations || [] });
}

// ── Helpers ──

async function getSiteForUser(supabase: any, userId: string, siteId: string) {
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, domain, wp_rest_url")
    .eq("id", siteId)
    .single();

  if (!site) return null;

  const { data: membership } = await supabase
    .from("org_users")
    .select("role")
    .eq("org_id", site.org_id)
    .eq("user_id", userId)
    .single();

  if (!membership) return null;
  return site;
}

async function callWpPlugin(site: any, route: string, body: any): Promise<any> {
  const baseUrl = site.wp_rest_url || `https://${site.domain}/wp-json`;

  // Get API key for this org
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("key_hash")
    .eq("org_id", site.org_id)
    .is("revoked_at", null)
    .limit(1);

  const keyHash = apiKeys?.[0]?.key_hash || "";

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

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
