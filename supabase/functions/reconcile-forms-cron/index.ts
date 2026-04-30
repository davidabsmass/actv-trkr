// reconcile-forms-cron
// Runs every 15 minutes via pg_cron. For each WordPress site:
//   1. Probes /wp-json/actv-trkr/v1/ping to see if the plugin is alive.
//   2. If alive, calls /wp-json/actv-trkr/v1/sync (which then posts to our
//      sync-entries endpoint, running the strict reconciliation we already have).
//   3. Records plugin_status (healthy | disconnected | unreachable) and detail.
//
// The only goal of this function is to ensure that lead/form counts in the
// dashboard always converge to what WordPress's authoritative tables report,
// independent of WP cron pings.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROBE_TIMEOUT_MS = 10000;
const SYNC_TIMEOUT_MS = 90000;
const BATCH_SIZE = 25; // sites per invocation

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probePlugin(siteUrl: string): Promise<
  { status: "healthy" | "disconnected" | "unreachable"; detail: string }
> {
  const normalized = siteUrl.replace(/\/$/, "");
  // The namespace root works on every plugin version that exposes the REST
  // namespace at all. /ping was added later and is not a reliable signal.
  const candidates = [
    `${normalized}/wp-json/actv-trkr/v1/`,
    `${normalized}/?rest_route=/actv-trkr/v1/`,
  ];

  let lastDetail = "no response";
  for (const endpoint of candidates) {
    try {
      const res = await fetchWithTimeout(endpoint, { method: "GET" }, PROBE_TIMEOUT_MS);
      if (res.ok) {
        const text = await res.clone().text().catch(() => "");
        // Sanity check: the response must look like a WP REST namespace doc.
        if (text.includes("actv-trkr") && text.includes("namespace")) {
          return { status: "healthy", detail: `Namespace responding (${res.status})` };
        }
        lastDetail = `200 but unexpected payload (${text.slice(0, 80)})`;
        continue;
      }
      if (res.status === 404) {
        const text = await res.clone().text().catch(() => "");
        if (text.includes("rest_no_route")) {
          // Confirm core REST is up so we know it's a plugin issue, not site down
          const restProbe = await fetchWithTimeout(
            `${normalized}/wp-json/`,
            { method: "GET" },
            PROBE_TIMEOUT_MS,
          ).catch(() => null);
          if (restProbe && restProbe.ok) {
            return { status: "disconnected", detail: "Plugin REST namespace not registered (plugin disabled or uninstalled)" };
          }
          lastDetail = "REST namespace missing and core REST unreachable";
          continue;
        }
      }
      lastDetail = `HTTP ${res.status}`;
    } catch (err) {
      lastDetail = `network error: ${(err as Error).message}`;
    }
  }
  return { status: "unreachable", detail: lastDetail };
}

async function triggerWordPressSync(siteUrl: string, keyHash: string): Promise<
  { ok: boolean; detail: string }
> {
  const normalized = siteUrl.replace(/\/$/, "");
  const endpoints = [
    `${normalized}/wp-json/actv-trkr/v1/sync`,
    `${normalized}/?rest_route=/actv-trkr/v1/sync`,
  ];
  const body = JSON.stringify({ triggered_from: "reconcile-cron", key_hash: keyHash });
  let lastDetail = "no response";
  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
        SYNC_TIMEOUT_MS,
      );
      if (res.ok) return { ok: true, detail: `sync OK on ${endpoint}` };
      lastDetail = `HTTP ${res.status} on ${endpoint}`;
    } catch (err) {
      lastDetail = `network error on ${endpoint}: ${(err as Error).message}`;
    }
  }
  return { ok: false, detail: lastDetail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pick WordPress sites that haven't been checked in the last ~10 minutes,
  // ordered by oldest check first (NULLS first means new sites take priority).
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: sites, error: sitesErr } = await supabase
    .from("sites")
    .select("id, org_id, domain, url, plugin_status, plugin_status_checked_at")
    .eq("type", "wordpress")
    .or(`plugin_status_checked_at.is.null,plugin_status_checked_at.lt.${cutoff}`)
    .order("plugin_status_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (sitesErr) {
    console.error("reconcile-forms-cron: sites query failed", sitesErr);
    return new Response(JSON.stringify({ error: sitesErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const site of sites || []) {
    const siteUrl = (site.url as string | null) || `https://${site.domain}`;
    const probe = await probePlugin(siteUrl);
    const updates: Record<string, unknown> = {
      plugin_status: probe.status,
      plugin_status_checked_at: new Date().toISOString(),
      plugin_status_detail: probe.detail,
    };

    let syncOutcome: string | null = null;
    if (probe.status === "healthy") {
      // Look up the org's API key so the WP plugin will accept our request
      const { data: apiKeyRow } = await supabase
        .from("api_keys")
        .select("key_hash")
        .eq("org_id", site.org_id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (apiKeyRow?.key_hash) {
        const sync = await triggerWordPressSync(siteUrl, apiKeyRow.key_hash);
        syncOutcome = sync.ok ? "ok" : `failed: ${sync.detail}`;
        updates.last_form_reconcile_at = new Date().toISOString();
        updates.last_form_reconcile_status = syncOutcome;
      } else {
        syncOutcome = "no api key";
        updates.last_form_reconcile_status = "skipped: no api key";
        updates.last_form_reconcile_at = new Date().toISOString();
      }
    }

    await supabase.from("sites").update(updates).eq("id", site.id);
    results.push({ site_id: site.id, domain: site.domain, ...probe, sync: syncOutcome });
  }

  // ── IRON-CLAD COUNTER HEAL ──
  // Recompute form_integrations.total_entries_imported from REAL leads truth and
  // auto-mark "stuck importing" rows as synced when leads have caught up.
  // Cursor counters drift when batches retry partial cursors; truth = COUNT(leads).
  let counterHealResult: any = null;
  try {
    const { error: healErr } = await supabase.rpc("reconcile_form_integration_counters");
    counterHealResult = healErr ? { error: healErr.message } : { ok: true };
  } catch (err) {
    counterHealResult = { error: (err as Error).message };
  }

  return new Response(
    JSON.stringify({ checked: results.length, results, counter_heal: counterHealResult }, null, 2),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
