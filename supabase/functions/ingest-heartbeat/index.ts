import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit, extractClientIp, hashIp,
  checkPayloadSize, logAnomaly, sanitizeStr,
} from "../_shared/ingestion-security.ts";

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

    // Normalize domain
    const domain = rawDomain.replace(/^www\./i, "");

    // Resolve or auto-create site
    let site = (await supabase.from("sites").select("id, status, plugin_version, allowed_domains").eq("org_id", orgId).eq("domain", domain).maybeSingle()).data;
    if (!site) {
      const pluginVer = sanitizeStr(body.plugin_version || body.pluginVersion, 32);
      const { data: newSite, error: insertErr } = await supabase.from("sites")
        .insert({
          org_id: orgId, domain, type: "wordpress",
          plugin_version: pluginVer,
          url: sanitizeStr(body.url, 2048) || `https://${domain}`,
          allowed_domains: [domain],
        })
        .select("id, status, plugin_version, allowed_domains").single();
      if (insertErr || !newSite) {
        console.error("Failed to auto-create site:", insertErr);
        return new Response(JSON.stringify({ error: "Could not register site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      site = newSite;
      console.log(`Auto-created site ${site.id} for domain ${domain}`);

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

      // Fire-and-forget: trigger form sync and domain/SSL check for the new site
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/trigger-site-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: site.id }),
        }).then(r => console.log(`Auto-sync triggered for new site ${site.id}: ${r.status}`))
          .catch(e => console.error("Auto-sync fire-and-forget failed:", e));

        fetch(`${supabaseUrl}/functions/v1/check-domain-ssl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: site.id }),
        }).then(r => console.log(`Domain/SSL check triggered for new site ${site.id}: ${r.status}`))
          .catch(e => console.error("Domain/SSL check fire-and-forget failed:", e));

        fetch(`${supabaseUrl}/functions/v1/scan-site-seo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ url: `https://${domain}`, site_id: site.id, org_id: orgId }),
        }).then(r => console.log(`SEO scan triggered for new site ${site.id}: ${r.status}`))
          .catch(e => console.error("SEO scan fire-and-forget failed:", e));
      } catch (e) {
        console.error("Failed to trigger auto-sync:", e);
      }
    }

    const now = new Date().toISOString();

    // Validate source field
    const signalSource = sanitizeStr(body.source, 32) || "js";

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
