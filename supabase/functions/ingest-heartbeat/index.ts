import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-actvtrkr-key",
};

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const apiKey = (req.headers.get("x-actvtrkr-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "").trim();
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    const body = await req.json();
    const domain = body.domain;
    if (!domain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Resolve or auto-create site
    let site = (await supabase.from("sites").select("id, status").eq("org_id", orgId).eq("domain", domain).maybeSingle()).data;
    if (!site) {
      const pluginVer = body.plugin_version || body.pluginVersion || null;
      const { data: newSite, error: insertErr } = await supabase.from("sites")
        .insert({ org_id: orgId, domain, type: "wordpress", plugin_version: pluginVer, url: body.url || `https://${domain}` })
        .select("id, status").single();
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
        console.log(`Renamed org ${orgId} from "${orgRow.name}" to "${domain}"`);
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

        // Fire-and-forget: trigger domain/SSL check for the new site
        fetch(`${supabaseUrl}/functions/v1/check-domain-ssl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ site_id: site.id }),
        }).then(r => console.log(`Domain/SSL check triggered for new site ${site.id}: ${r.status}`))
          .catch(e => console.error("Domain/SSL check fire-and-forget failed:", e));
      } catch (e) {
        console.error("Failed to trigger auto-sync:", e);
      }
    }

    const now = new Date().toISOString();

    // Insert heartbeat
    await supabase.from("site_heartbeats").insert({
      site_id: site.id,
      received_at: now,
      source: body.source || "js",
      meta: body.meta || {},
    });

    // Update last_heartbeat_at and plugin_version on site
    const updateData: Record<string, unknown> = { last_heartbeat_at: now, status: "UP" };
    const pluginVersion = body.plugin_version || body.pluginVersion;
    if (pluginVersion && typeof pluginVersion === "string") {
      updateData.plugin_version = pluginVersion;
    }
    await supabase.from("sites").update(updateData).eq("id", site.id);

    // If site was DOWN and we got a response, recover it
    if (site.status === "DOWN") {
      // Resolve open DOWNTIME incident and send recovery notification
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
    console.error("Heartbeat error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
