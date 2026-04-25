/**
 * Background import queue processor.
 * Runs on pg_cron every 2 minutes.
 * Picks up eligible form_import_jobs, acquires locks, processes batches,
 * advances cursors, and handles stall detection + adaptive batch sizing.
 *
 * Does NOT duplicate ingestion — calls manage-import-job?action=process
 * for actual batch work, which in turn calls the WP plugin.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 min stale lock
const STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 min no signal
const MAX_BATCHES_PER_RUN = 5; // limit per function invocation
const MAX_JOBS_PER_RUN = 3;
const MIN_BATCH_SIZE = 10;
// ingest-form-batch is payload-capped, and WP hosts can be memory constrained.
// Keep importer batches conservative so one oversized/partial response cannot
// advance the cursor and silently skip entries.
const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 10;

// Oversized-form safety: forms above JUNK_THRESHOLD are imported newest-first
// and capped at IMPORT_CAP entries to keep the dataset useful and the
// download cost bounded.
const JUNK_THRESHOLD = 50_000;
const IMPORT_CAP = 8_000;

function getWpBaseUrl(site: { url?: string | null; domain?: string | null }) {
  const siteUrl = site.url || (site.domain ? `https://${site.domain}` : "");
  return `${siteUrl.replace(/\/$/, "")}/wp-json`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Verify cron secret
  const cronSecret = req.headers.get("x-cron-secret") || "";
  const expectedSecret = Deno.env.get("CRON_SECRET") || "";
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: any[] = [];

  try {
    // Step 1: Detect and handle stalled jobs
    await detectStalledJobs(supabase);

    // Step 2: Pick eligible jobs
    const jobs = await pickEligibleJobs(supabase);
    if (jobs.length === 0) {
      return json({ ok: true, message: "No eligible jobs", results });
    }

    // Step 3: Process each job
    for (const job of jobs) {
      const result = await processJob(supabase, job);
      results.push(result);
    }

    return json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error("process-import-queue error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

async function detectStalledJobs(supabase: any) {
  const stallCutoff = new Date(Date.now() - STALL_THRESHOLD_MS).toISOString();

  // Find running jobs with stale signal
  const { data: stalledJobs } = await supabase
    .from("form_import_jobs")
    .select("id, retry_count, auto_resume_enabled, form_integration_id")
    .eq("status", "running")
    .lt("heartbeat_at", stallCutoff);

  if (!stalledJobs || stalledJobs.length === 0) return;

  for (const job of stalledJobs) {
    const newRetry = (job.retry_count || 0) + 1;

    if (job.auto_resume_enabled && newRetry < MAX_RETRIES) {
      // Mark stalled but auto-resumable
      await supabase.from("form_import_jobs").update({
        status: "stalled",
        lock_token: null,
        locked_at: null,
        last_error: "Job stalled — no signal detected. Auto-resuming.",
        retry_count: newRetry,
        next_run_at: new Date(Date.now() + 30_000).toISOString(), // retry in 30s
      }).eq("id", job.id);

      console.log(`Job ${job.id} stalled, will auto-resume (retry ${newRetry})`);
    } else {
      // Mark failed
      await supabase.from("form_import_jobs").update({
        status: "failed",
        lock_token: null,
        locked_at: null,
        last_error: `Job stalled repeatedly (${newRetry} retries). Marked failed.`,
        retry_count: newRetry,
      }).eq("id", job.id);

      await supabase.from("form_integrations")
        .update({ status: "error", last_error: "Import job failed after repeated stalls" })
        .eq("id", job.form_integration_id);

      console.log(`Job ${job.id} permanently failed after ${newRetry} stalls`);
    }
  }
}

async function pickEligibleJobs(supabase: any): Promise<any[]> {
  const now = new Date().toISOString();

  // Pick jobs that are pending, stalled (auto-resume), or running with stale lock
  const { data: jobs } = await supabase
    .from("form_import_jobs")
    .select("id, status, lock_token, locked_at, next_run_at, adaptive_batch_size, retry_count, cursor, form_integration_id, site_id, org_id")
    .in("status", ["pending", "stalled"])
    .lte("next_run_at", now)
    .is("lock_token", null)
    .order("next_run_at", { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  return jobs || [];
}

async function processJob(supabase: any, job: any) {
  const lockToken = crypto.randomUUID();
  const now = new Date().toISOString();

  // Acquire lock atomically
  const { data: locked, error: lockErr } = await supabase
    .from("form_import_jobs")
    .update({
      lock_token: lockToken,
      locked_at: now,
      heartbeat_at: now,
      status: "running",
    })
    .eq("id", job.id)
    .is("lock_token", null) // only if not already locked
    .in("status", ["pending", "stalled"])
    .select("id")
    .single();

  if (lockErr || !locked) {
    return { job_id: job.id, skipped: true, reason: "Lock acquisition failed" };
  }

  // Update integration status
  await supabase.from("form_integrations")
    .update({ status: "importing" })
    .eq("id", job.form_integration_id);

  let batchesProcessed = 0;
  let totalNewProcessed = 0;
  let lastError: string | null = null;
  let hasMore = true;
  let currentBatchSize = Math.min(job.adaptive_batch_size || 100, MAX_BATCH_SIZE);

  // Get site info for WP plugin calls
  const { data: site } = await supabase
    .from("sites")
    .select("id, org_id, domain, url")
    .eq("id", job.site_id)
    .single();

  if (!site) {
    await releaseLock(supabase, job.id, lockToken, "failed", "Site not found");
    return { job_id: job.id, error: "Site not found" };
  }

  // Get integration info (need total_entries_estimated for cap detection)
  const { data: integration } = await supabase
    .from("form_integrations")
    .select("builder_type, external_form_id, total_entries_estimated")
    .eq("id", job.form_integration_id)
    .single();

  if (!integration) {
    await releaseLock(supabase, job.id, lockToken, "failed", "Integration not found");
    return { job_id: job.id, error: "Integration not found" };
  }

  // Capped-mode flag — applies to oversized forms (e.g. 755k spam tables).
  // We import the most recent entries first and stop once we hit IMPORT_CAP.
  const isCapped = (integration.total_entries_estimated || 0) > JUNK_THRESHOLD;
  const direction = isCapped ? "DESC" : "ASC";
  const effectiveCap = isCapped ? IMPORT_CAP : Number.POSITIVE_INFINITY;

  // Get current cursor
  const { data: currentJob } = await supabase
    .from("form_import_jobs")
    .select("cursor, total_processed")
    .eq("id", job.id)
    .single();

  let cursor = currentJob?.cursor || null;
  let totalProcessed = currentJob?.total_processed || 0;

  try {
    while (hasMore && batchesProcessed < MAX_BATCHES_PER_RUN) {
      // Heartbeat
      await supabase.from("form_import_jobs").update({
        heartbeat_at: new Date().toISOString(),
      }).eq("id", job.id).eq("lock_token", lockToken);

      // Check for cancel request
      const { data: checkJob } = await supabase
        .from("form_import_jobs")
        .select("status")
        .eq("id", job.id)
        .single();

      if (checkJob?.status === "cancel_requested") {
        await releaseLock(supabase, job.id, lockToken, "cancelled", "Cancelled by user");
        return { job_id: job.id, cancelled: true };
      }

      // Cap-aware batch sizing — never request more than the remaining cap
      const remainingCap = isCapped ? Math.max(1, IMPORT_CAP - totalProcessed) : currentBatchSize;
      const requestBatchSize = Math.min(currentBatchSize, remainingCap);

      // Call WP plugin for batch
      const wpResult = await callWpPlugin(supabase, site, "import-batch", {
        builder_type: integration.builder_type,
        form_id: integration.external_form_id,
        cursor,
        batch_size: requestBatchSize,
        direction,
      });

      if (!wpResult.ok) {
        lastError = wpResult.error || "WP plugin error";

        // Detect WP host rate-limiting (HTTP 429). Treat as transient: don't
        // shrink batch, don't count toward MAX_RETRIES — just back off long.
        const isRateLimited = /HTTP 429/i.test(lastError) || /rate.?limit/i.test(lastError);

        if (isRateLimited) {
          const backoffMs = 2 * 60 * 1000; // 2-minute fixed backoff for 429
          await releaseLock(supabase, job.id, lockToken, "pending", `Rate-limited by host — backing off 2 min`, {
            next_run_at: new Date(Date.now() + backoffMs).toISOString(),
          });
          console.log(`Job ${job.id} rate-limited (429) — retry in 2 min`);
          return { job_id: job.id, error: "rate_limited", batches: batchesProcessed };
        }

        // Adaptive: reduce batch size on non-429 failure
        const newBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(currentBatchSize * 0.5));
        const newRetry = (job.retry_count || 0) + 1;

        if (newRetry >= MAX_RETRIES) {
          await releaseLock(supabase, job.id, lockToken, "failed", lastError, {
            adaptive_batch_size: newBatchSize,
            retry_count: newRetry,
          });
          await supabase.from("form_integrations")
            .update({ status: "error", last_error: lastError })
            .eq("id", job.form_integration_id);
          return { job_id: job.id, error: lastError, batches: batchesProcessed };
        }

        // Schedule retry with smaller batch
        await releaseLock(supabase, job.id, lockToken, "pending", lastError, {
          adaptive_batch_size: newBatchSize,
          retry_count: newRetry,
          next_run_at: new Date(Date.now() + Math.min(2000 * Math.pow(2, newRetry), 300_000)).toISOString(),
        });

        console.log(`Job ${job.id} batch failed, reducing batch ${currentBatchSize} → ${newBatchSize}, retry ${newRetry}`);
        return { job_id: job.id, error: lastError, batches: batchesProcessed, newBatchSize };
      }

      // Success
      const processed = Number(wpResult.processed || 0);
      const batchCount = Number(wpResult.batch_count || processed || 0);
      const errorCount = Number(wpResult.errors || 0);

      if (errorCount > 0 || (batchCount > 0 && processed < batchCount)) {
        lastError = `Import batch only stored ${processed}/${batchCount || requestBatchSize} entries${errorCount ? ` (${errorCount} errors)` : ""}; retrying same cursor with smaller batches`;
        const newBatchSize = Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, Math.floor(currentBatchSize * 0.5)));
        const newRetry = (job.retry_count || 0) + 1;

        await releaseLock(supabase, job.id, lockToken, newRetry >= MAX_RETRIES ? "failed" : "pending", lastError, {
          adaptive_batch_size: newBatchSize,
          retry_count: newRetry,
          next_run_at: newRetry >= MAX_RETRIES ? null : new Date(Date.now() + Math.min(2000 * Math.pow(2, newRetry), 300_000)).toISOString(),
        });

        if (newRetry >= MAX_RETRIES) {
          await supabase.from("form_integrations")
            .update({ status: "error", last_error: lastError })
            .eq("id", job.form_integration_id);
        }

        return { job_id: job.id, error: lastError, batches: batchesProcessed, newBatchSize };
      }

      totalProcessed += processed;
      hasMore = wpResult.has_more === true;
      cursor = wpResult.next_cursor || null;
      batchesProcessed++;
      totalNewProcessed += processed;

      // Reset retry count on success, cautiously increase batch size
      const successBatchSize = Math.min(MAX_BATCH_SIZE, currentBatchSize + 10);
      currentBatchSize = successBatchSize;

      // Checkpoint after each batch
      await supabase.from("form_import_jobs").update({
        cursor,
        total_processed: totalProcessed,
        last_batch_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        retry_count: 0,
        last_error: null,
        adaptive_batch_size: currentBatchSize,
      }).eq("id", job.id).eq("lock_token", lockToken);

      // Stop if we've hit the cap
      if (isCapped && totalProcessed >= effectiveCap) {
        hasMore = false;
        break;
      }
    }
  } catch (err) {
    lastError = String(err).slice(0, 500);
    await releaseLock(supabase, job.id, lockToken, "pending", lastError, {
      next_run_at: new Date(Date.now() + 60_000).toISOString(),
    });
    return { job_id: job.id, error: lastError, batches: batchesProcessed };
  }

  // Determine final state
  if (!hasMore) {
    const expected = currentJob?.total_processed != null
      ? (await supabase.from("form_import_jobs").select("total_expected").eq("id", job.id).single()).data?.total_expected || 0
      : 0;
    const gap = expected - totalProcessed;
    const meaningfulGap = !isCapped && expected > 0 && gap >= 5; // ignore tiny rounding gaps

    if (meaningfulGap) {
      // WP returned no more entries but we're short of expected — likely a
      // stale cursor or transient WP-side issue. Reset cursor and retry once
      // with longer backoff instead of marking synced at the wrong number.
      await releaseLock(supabase, job.id, lockToken, "pending",
        `Reached end of pagination at ${totalProcessed}/${expected}; resetting cursor for re-scan`, {
        cursor: null,
        next_run_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5-min backoff
      });
      console.log(`Job ${job.id} short of expected (${totalProcessed}/${expected}) — cursor reset, retry in 5min`);
    } else {
      // Truly completed (either fully synced or capped)
      const cappedNote = isCapped
        ? `Capped at ${IMPORT_CAP.toLocaleString()} most-recent of ${(integration.total_entries_estimated || 0).toLocaleString()} entries`
        : null;
      await releaseLock(supabase, job.id, lockToken, "completed", cappedNote);
      await supabase.from("form_integrations").update({
        status: "synced",
        total_entries_imported: totalProcessed,
        last_synced_at: new Date().toISOString(),
        last_error: cappedNote,
      }).eq("id", job.form_integration_id);

      console.log(`Job ${job.id} completed. Total: ${totalProcessed}${isCapped ? " (capped)" : ""}`);
    }
  } else {
    // More to do — schedule next run
    await releaseLock(supabase, job.id, lockToken, "pending", null, {
      next_run_at: new Date(Date.now() + 5_000).toISOString(), // quick follow-up
    });
  }

  return {
    job_id: job.id,
    batches: batchesProcessed,
    totalNewProcessed,
    totalProcessed,
    hasMore,
    status: hasMore ? "pending" : "completed",
  };
}

async function releaseLock(
  supabase: any,
  jobId: string,
  lockToken: string,
  status: string,
  lastError: string | null,
  extra: any = {},
) {
  const update: any = {
    lock_token: null,
    locked_at: null,
    status,
    ...extra,
  };
  if (lastError !== undefined) update.last_error = lastError;
  if (status === "cancelled") update.cancel_reason = lastError;

  await supabase.from("form_import_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("lock_token", lockToken);
}

async function callWpPlugin(supabase: any, site: any, route: string, body: any): Promise<any> {
  const baseUrl = getWpBaseUrl(site);

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
