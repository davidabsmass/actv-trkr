import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  // Allow auth via cron secret header OR service role bearer token
  const isCronAuth = cronSecret && incoming === cronSecret;
  const isServiceRole = serviceKey && authHeader === `Bearer ${serviceKey}`;

  if (!isCronAuth && !isServiceRole) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceKey);

    // Self-heal: ensure cron_secret exists in app_config so pg_cron schedule works
    const { data: existingSecret } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "cron_secret")
      .maybeSingle();

    if (!existingSecret && cronSecret) {
      await supabase
        .from("app_config")
        .upsert({ key: "cron_secret", value: cronSecret }, { onConflict: "key" });
      console.log("Self-healed: inserted cron_secret into app_config");
    }

    // Get all active sites with a plugin installed and an active API key
    const { data: sites, error: sitesErr } = await supabase
      .from("sites")
      .select("id, domain, org_id, plugin_version")
      .not("plugin_version", "is", null);

    if (sitesErr) {
      console.error("Failed to query sites:", sitesErr);
      return new Response(JSON.stringify({ error: sitesErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ message: "No sites with plugin installed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ site_id: string; domain: string; status: string; error?: string }> = [];

    for (const site of sites) {
      try {
        // Check for an active (non-revoked) API key for this org
        const { data: keys } = await supabase
          .from("api_keys")
          .select("id")
          .eq("org_id", site.org_id)
          .is("revoked_at", null)
          .limit(1);

        if (!keys || keys.length === 0) {
          results.push({ site_id: site.id, domain: site.domain, status: "skipped", error: "No active API key" });
          continue;
        }

        // Call trigger-site-sync for this site
        const resp = await fetch(`${supabaseUrl}/functions/v1/trigger-site-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
            "x-cron-secret": cronSecret ?? "",
          },
          body: JSON.stringify({ site_id: site.id }),
        });

        const body = await resp.text();
        if (resp.ok) {
          results.push({ site_id: site.id, domain: site.domain, status: "synced" });
        } else {
          results.push({ site_id: site.id, domain: site.domain, status: "error", error: body.substring(0, 200) });
        }
      } catch (e) {
        results.push({ site_id: site.id, domain: site.domain, status: "error", error: String(e).substring(0, 200) });
      }
    }

    console.log("Daily site sync complete:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, synced: results.filter(r => r.status === "synced").length, total: sites.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("daily-site-sync error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
