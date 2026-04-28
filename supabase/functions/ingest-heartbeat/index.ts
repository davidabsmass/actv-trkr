import { createClient } from "npm:@supabase/supabase-js@2";
import {
  checkRateLimit, extractClientIp, hashIp,
  checkPayloadSize, logAnomaly, sanitizeStr,
} from "../_shared/ingestion-security.ts";
import { gateOrgLifecycle } from "../_shared/org-lifecycle-gate.ts";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-actvtrkr-key",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split(".").map((part) => Number.parseInt(part, 10) || 0);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const aPart = aParts[i] ?? 0;
    const bPart = bParts[i] ?? 0;

    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  return 0;
}

const MAX_SIGNAL_PAYLOAD = 102400; // 100KB for signal (includes wp_environment)
const BOOTSTRAP_RETRY_WINDOW_MS = 6 * 60 * 60 * 1000;
const INSTALL_BOOTSTRAP_SOURCES = new Set(["cron", "wp_connection_test", "wp_admin_recovery"]);

// Org names that we consider "generic" / safe to overwrite with a site domain.
// Anything else is left alone — we never overwrite a name the user might have set.
const GENERIC_ORG_NAMES = new Set(["", "my organization", "untitled", "new organization"]);

/**
 * Org-name reconciliation. If the org name doesn't match any of the org's
 * actual site domains, rename it to the primary site domain. This catches
 * the case where create_org_with_admin reused an old org for a new install
 * (e.g. user signs up for a 2nd site, gets attached to their 1st org).
 *
 * Rules:
 *   - If the org has only one site, the name should equal that site's domain.
 *   - If the org name is generic ("My Organization" etc.), always rename.
 *   - If the org name matches some site's domain, leave it alone (multi-site).
 *   - Never silently rename a name the user set themselves *unless* it doesn't
 *     match any site at all (the ghoulspodcast → bbbedu case).
 */
async function reconcileOrgName(params: {
  supabase: any;
  orgId: string;
  currentSiteDomain: string;
}) {
  const { supabase, orgId, currentSiteDomain } = params;

  const { data: orgRow } = await supabase.from("orgs").select("name").eq("id", orgId).maybeSingle();
  if (!orgRow) return;
  const currentName = (orgRow.name || "").trim();
  const currentNameLower = currentName.toLowerCase();

  const { data: sitesRows } = await supabase.from("sites").select("domain, created_at").eq("org_id", orgId);
  const siteDomains = (sitesRows || []).map((s: any) => (s.domain || "").toLowerCase()).filter(Boolean);
  if (siteDomains.length === 0) return;

  // If name matches any site domain, we're consistent — done.
  if (siteDomains.includes(currentNameLower)) return;

  // If name is generic, always rename.
  // Otherwise rename only when no site domain matches (the failure mode).
  const shouldRename = GENERIC_ORG_NAMES.has(currentNameLower) || !siteDomains.includes(currentNameLower);
  if (!shouldRename) return;

  // Pick the oldest site as the canonical name (most likely the primary).
  const oldest = (sitesRows || []).slice().sort((a: any, b: any) => {
    const at = a.created_at ? Date.parse(a.created_at) : 0;
    const bt = b.created_at ? Date.parse(b.created_at) : 0;
    return at - bt;
  })[0];
  const newName = (oldest?.domain || currentSiteDomain).toLowerCase();
  if (!newName || newName === currentNameLower) return;

  const { error: updateErr } = await supabase.from("orgs").update({ name: newName }).eq("id", orgId);
  if (updateErr) {
    console.error(JSON.stringify({
      level: "error",
      event: "org_rename_failed",
      org_id: orgId,
      from: currentName,
      to: newName,
      error: updateErr.message,
    }));
    return;
  }
  console.log(JSON.stringify({
    level: "info",
    event: "org_renamed_to_match_site",
    org_id: orgId,
    from: currentName,
    to: newName,
    site_count: siteDomains.length,
  }));
}

async function maybeTriggerPostInstallBootstrap(params: {
  supabase: any;
  site: { id: string; plugin_version: string | null; last_heartbeat_at?: string | null };
  pluginVersion: string | null;
  signalSource: string;
}) {
  const { supabase, site, pluginVersion, signalSource } = params;

  const pluginVersionAdvanced = !!pluginVersion && (!site.plugin_version || compareVersions(pluginVersion, site.plugin_version) > 0);
  const previousHeartbeatMs = site.last_heartbeat_at ? Date.parse(site.last_heartbeat_at) : Number.NaN;
  const heartbeatIsMissingOrStale = !Number.isFinite(previousHeartbeatMs) || (Date.now() - previousHeartbeatMs) >= BOOTSTRAP_RETRY_WINDOW_MS;
  const sourceRequestsBootstrap = INSTALL_BOOTSTRAP_SOURCES.has(signalSource);

  if (!pluginVersionAdvanced && !heartbeatIsMissingOrStale && !sourceRequestsBootstrap) {
    return;
  }

  const [formsCountResult, formsMissingPageUrlsResult, formHealthCountResult, formIntegrationsCountResult, domainHealthRowResult, sslHealthRowResult] = await Promise.all([
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("site_id", site.id).eq("archived", false),
    supabase.from("forms").select("id", { count: "exact", head: true }).eq("site_id", site.id).eq("archived", false).is("page_url", null),
    supabase.from("form_health_checks").select("id", { count: "exact", head: true }).eq("site_id", site.id),
    supabase.from("form_integrations").select("id", { count: "exact", head: true }).eq("site_id", site.id),
    supabase.from("domain_health").select("last_checked_at").eq("site_id", site.id).maybeSingle(),
    supabase.from("ssl_health").select("last_checked_at").eq("site_id", site.id).maybeSingle(),
  ]);

  const formsCount = formsCountResult.count || 0;
  const formsMissingPageUrls = formsMissingPageUrlsResult.count || 0;
  const formHealthCount = formHealthCountResult.count || 0;
  const formIntegrationsCount = formIntegrationsCountResult.count || 0;
  const domainHealth = domainHealthRowResult.data as { last_checked_at?: string | null } | null;
  const sslHealth = sslHealthRowResult.data as { last_checked_at?: string | null } | null;

  const staleBeforeIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const domainHealthStale = !domainHealth?.last_checked_at || domainHealth.last_checked_at < staleBeforeIso;
  const sslHealthStale = !sslHealth?.last_checked_at || sslHealth.last_checked_at < staleBeforeIso;
  // Re-run discovery if we have no forms, missing page URLs, missing health rows,
  // OR if forms exist but their integration records are missing (so the imports UI shows nothing).
  const needsFormBootstrap = formsCount === 0 || formsMissingPageUrls > 0
    || (formsCount > 0 && formHealthCount < formsCount)
    || (formsCount > 0 && formIntegrationsCount === 0);
  const needsDomainBootstrap = !domainHealth || !sslHealth || domainHealthStale || sslHealthStale;

  if (!needsFormBootstrap && !needsDomainBootstrap) {
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const requests: Promise<Response>[] = [];

  if (needsFormBootstrap) {
    requests.push(fetch(`${supabaseUrl}/functions/v1/trigger-site-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ site_id: site.id, force_form_probe: true }),
    }));
  }

  if (needsDomainBootstrap) {
    requests.push(fetch(`${supabaseUrl}/functions/v1/check-domain-ssl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ site_id: site.id }),
    }));
  }

  const results = await Promise.allSettled(requests);
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(`Post-install bootstrap request ${index + 1} for site ${site.id} returned ${result.value.status}`);
    } else {
      console.error(`Post-install bootstrap request ${index + 1} for site ${site.id} failed:`, result.reason);
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const clientIp = extractClientIp(req);

  try {
    const apiKey = (req.headers.get("x-actvtrkr-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "").trim();
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
      logAnomaly(supabase, orgId, null, "rate_limit_exceeded", { endpoint: "ingest-signal", reason: rateCheck.reason });
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } });
    }

    // ── Payload size check ──
    const rawBody = await req.text();
    if (rawBody.length > MAX_SIGNAL_PAYLOAD) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawDomain = sanitizeStr(body.domain, 253);
    if (!rawDomain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const signalSource = sanitizeStr(body.source, 64) || "unknown";

    // Normalize domain
    const domain = rawDomain.replace(/^www\./i, "");

    // Resolve or auto-create site
    let site = (await supabase.from("sites").select("id, status, plugin_version, last_heartbeat_at, allowed_domains").eq("org_id", orgId).eq("domain", domain).maybeSingle()).data;
    if (!site) {
      const pluginVer = sanitizeStr(body.plugin_version || body.pluginVersion, 32);
      const { data: newSite, error: insertErr } = await supabase.from("sites")
        .insert({
          org_id: orgId, domain, type: "wordpress",
          plugin_version: pluginVer,
          url: sanitizeStr(body.url, 2048) || `https://${domain}`,
          allowed_domains: [domain],
        })
        .select("id, status, plugin_version, last_heartbeat_at, allowed_domains").single();
      if (insertErr || !newSite) {
        console.error("Failed to auto-create site:", insertErr);
        return new Response(JSON.stringify({ error: "Could not register site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      site = newSite;
      const siteId = newSite.id;
      console.log(`Auto-created site ${siteId} for domain ${domain}`);

      // Auto-rename generic org to site domain
      const { data: orgRow } = await supabase.from("orgs").select("name").eq("id", orgId).maybeSingle();
      if (orgRow && (orgRow.name === "My Organization" || orgRow.name === "")) {
        await supabase.from("orgs").update({ name: domain }).eq("id", orgId);
      }

      // Auto-populate subscriber site_url from connected domain
      const { data: orgUsers } = await supabase.from("org_users").select("user_id").eq("org_id", orgId);
      if (orgUsers && orgUsers.length > 0) {
        const userIds = orgUsers.map((u: any) => u.user_id);
        const { data: profiles } = await supabase.from("profiles").select("email").in("user_id", userIds);
        if (profiles && profiles.length > 0) {
          const emails = profiles.map((p: any) => p.email).filter(Boolean);
          for (const email of emails) {
            await supabase.from("subscribers").update({ site_url: domain }).eq("email", email).is("site_url", null);
          }
        }
      }

      // Fire-and-forget: trigger install bootstrap for the new site
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/trigger-site-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: siteId, force_form_probe: true }),
        }).then(r => console.log(`Auto-sync triggered for new site ${siteId}: ${r.status}`))
          .catch(e => console.error("Auto-sync fire-and-forget failed:", e));

        fetch(`${supabaseUrl}/functions/v1/check-domain-ssl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: siteId }),
        }).then(r => console.log(`Domain/SSL check triggered for new site ${siteId}: ${r.status}`))
          .catch(e => console.error("Domain/SSL check fire-and-forget failed:", e));

        fetch(`${supabaseUrl}/functions/v1/scan-site-seo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ url: `https://${domain}`, site_id: siteId, org_id: orgId }),
        }).then(r => console.log(`SEO scan triggered for new site ${siteId}: ${r.status}`))
          .catch(e => console.error("SEO scan fire-and-forget failed:", e));
      } catch (e) {
        console.error("Failed to trigger auto-sync:", e);
      }
    } else {
      // Existing site path. Two safety nets run on every heartbeat:
      //   1. Org-name reconciliation: if the org name doesn't match any of its
      //      sites' domains (e.g. it was reused from a prior install), rename
      //      it to the primary site's domain so the dashboard never lies.
      //   2. Bootstrap reconciliation: if forms exist but form_integrations
      //      are missing (or domain/SSL health is stale), re-trigger discovery.
      try {
        await reconcileOrgName({ supabase, orgId, currentSiteDomain: domain });
      } catch (renameErr) {
        console.error(JSON.stringify({
          level: "error",
          event: "org_rename_reconcile_failed",
          site_id: site.id,
          org_id: orgId,
          domain,
          error: String(renameErr),
        }));
      }
      try {
        const pluginVersion = sanitizeStr(body.plugin_version || body.pluginVersion, 32);
        await maybeTriggerPostInstallBootstrap({ supabase, site, pluginVersion, signalSource });
      } catch (bootstrapErr) {
        // Surface as structured ERROR so it shows up in log search and alerts.
        // We still don't want to fail the heartbeat (the WP plugin would retry
        // forever), but the failure must be loud, not silent.
        console.error(JSON.stringify({
          level: "error",
          event: "bootstrap_reconcile_failed",
          site_id: site.id,
          org_id: orgId,
          domain,
          error: String(bootstrapErr),
          stack: bootstrapErr instanceof Error ? bootstrapErr.stack : undefined,
        }));
      }
    }

    const now = new Date().toISOString();

    // Insert signal
    await supabase.from("site_heartbeats").insert({
      site_id: site.id,
      received_at: now,
      source: signalSource,
      meta: typeof body.meta === "object" && body.meta !== null ? body.meta : {},
    });

    // Update last_heartbeat_at (signal timestamp) and plugin_version on site
    const updateData: Record<string, unknown> = { last_heartbeat_at: now, status: "UP" };
    const pluginVersion = sanitizeStr(body.plugin_version || body.pluginVersion, 32);
    if (
      pluginVersion &&
      typeof pluginVersion === "string" &&
      (!site.plugin_version || compareVersions(pluginVersion, site.plugin_version) > 0)
    ) {
      updateData.plugin_version = pluginVersion;
    }
    await supabase.from("sites").update(updateData).eq("id", site.id);

    // Keep tracking status in sync with heartbeats so low-traffic sites do not
    // get flagged offline when cron heartbeats are still arriving.
    try {
      await supabase.from("site_tracking_status").upsert({
        org_id: orgId,
        site_id: site.id,
        last_heartbeat_at: now,
        tracker_status: "active",
        updated_at: now,
      }, { onConflict: "org_id,site_id" });
    } catch (statusErr) {
      console.error("Tracking status heartbeat sync error (non-fatal):", statusErr);
    }

    // Persist WP environment data if provided
    const wpEnv = body.wp_environment;
    if (wpEnv && typeof wpEnv === "object") {
      const envRow: Record<string, unknown> = {
        site_id: site.id,
        org_id: orgId,
        last_reported_at: now,
      };
      if (wpEnv.wp_version) envRow.wp_version = sanitizeStr(wpEnv.wp_version, 32);
      if (wpEnv.php_version) envRow.php_version = sanitizeStr(wpEnv.php_version, 32);
      if (wpEnv.theme_name) envRow.theme_name = sanitizeStr(wpEnv.theme_name, 128);
      if (wpEnv.theme_version) envRow.theme_version = sanitizeStr(wpEnv.theme_version, 32);
      if (Array.isArray(wpEnv.active_plugins)) envRow.active_plugins = wpEnv.active_plugins.slice(0, 200);
      if (Array.isArray(wpEnv.plugin_updates)) envRow.plugin_updates = wpEnv.plugin_updates.slice(0, 100);
      if (wpEnv.core_update_available) envRow.core_update_available = wpEnv.core_update_available;

      await supabase.from("site_wp_environment")
        .upsert(envRow, { onConflict: "site_id" });
    }

    // If site was DOWN and we got a response, recover it
    if (site.status === "DOWN") {
      const { data: openIncident } = await supabase
        .from("incidents")
        .select("id, started_at")
        .eq("site_id", site.id)
        .eq("type", "DOWNTIME")
        .is("resolved_at", null)
        .maybeSingle();

      if (openIncident) {
        await supabase.from("incidents").update({ resolved_at: now }).eq("id", openIncident.id);

        const downtimeMinutes = Math.round((new Date(now).getTime() - new Date(openIncident.started_at).getTime()) / 60000);

        await supabase.from("monitoring_alerts").insert({
          site_id: site.id,
          org_id: orgId,
          incident_id: openIncident.id,
          alert_type: "DOWNTIME",
          severity: "info",
          subject: `Site RECOVERED: ${domain}`,
          message: `${domain} is back online after ${downtimeMinutes} minute${downtimeMinutes === 1 ? "" : "s"} of downtime.`,
        });
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Signal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
