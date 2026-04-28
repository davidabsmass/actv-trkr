/**
 * Batch form ingestion endpoint.
 * Accepts an array of entry payloads and processes them sequentially within a single request.
 * Used by the WP plugin backfill to drastically reduce HTTP round-trips.
 * 
 * Security: max 100 entries per batch, payload size capped at 2MB.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit, extractClientIp, logAnomaly } from "../_shared/ingestion-security.ts";
import { gateOrgLifecycle } from "../_shared/org-lifecycle-gate.ts";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BATCH_SIZE = 100;
const MAX_BATCH_PAYLOAD_BYTES = 2_097_152; // 2MB

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const clientIp = extractClientIp(req);

  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey || apiKey.length > 256) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    // ── Org lifecycle gate (cancel/grace/archived) ──
    const gate = await gateOrgLifecycle(supabase, orgId);
    if (gate) {
      return new Response(JSON.stringify(gate.body), { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Rate limiting ──
    const rateCheck = checkRateLimit(clientIp, null, orgId);
    if (!rateCheck.allowed) {
      logAnomaly(supabase, orgId, null, "rate_limit_exceeded", { endpoint: "ingest-form-batch", reason: rateCheck.reason });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    // ── Payload size check ──
    const rawBody = await req.text();
    if (rawBody.length > MAX_BATCH_PAYLOAD_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const entries = body.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ error: "Missing or empty entries array" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Enforce max batch size ──
    if (entries.length > MAX_BATCH_SIZE) {
      return new Response(JSON.stringify({ error: `Batch too large, max ${MAX_BATCH_SIZE} entries` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const batch = entries;

    // Forward each entry to the ingest-form function internally
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const ingestUrl = `${supabaseUrl}/functions/v1/ingest-form`;

    let processed = 0;
    let errors = 0;
    const results: { entry_id: string; status: string; error?: string }[] = [];

    // Process in parallel groups of 10 for speed
    for (let i = 0; i < batch.length; i += 10) {
      const chunk = batch.slice(i, i + 10);
      const promises = chunk.map(async (entryPayload: any) => {
        const entryId = entryPayload?.entry?.entry_id || "unknown";
        try {
          const res = await fetch(ingestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(entryPayload),
          });

          if (res.ok) {
            processed++;
            results.push({ entry_id: entryId, status: "ok" });
          } else {
            errors++;
            const text = await res.text();
            results.push({ entry_id: entryId, status: "error", error: `${res.status}: ${text.slice(0, 100)}` });
          }
        } catch (err) {
          errors++;
          results.push({ entry_id: entryId, status: "error", error: String(err).slice(0, 100) });
        }
      });

      await Promise.all(promises);
    }

    if (errors > batch.length / 2) {
      logAnomaly(supabase, orgId, null, "batch_high_error_rate", { processed, errors, total: batch.length });
    }

    console.log(`Batch ingest: ${processed} processed, ${errors} errors out of ${batch.length} entries`);

    observe(supabase, { orgId, endpoint: "ingest-form-batch", status: "ok", details: { processed, total: batch.length } });
    return new Response(JSON.stringify({
      ok: true,
      processed,
      errors,
      total: batch.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Batch ingest error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
