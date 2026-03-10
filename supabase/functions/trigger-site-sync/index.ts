import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the dashboard user
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { site_id } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: "Missing site_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Look up the site
    const { data: site } = await supabase
      .from("sites").select("id, domain, org_id, url")
      .eq("id", site_id).maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a member of the org
    const { data: membership } = await supabase
      .from("org_users").select("role")
      .eq("org_id", site.org_id).eq("user_id", user.id).maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the org's API key hash (the WP plugin stores and sends the key itself)
    const { data: apiKeyRow } = await supabase
      .from("api_keys").select("key_hash")
      .eq("org_id", site.org_id).is("revoked_at", null)
      .limit(1).maybeSingle();

    if (!apiKeyRow?.key_hash) {
      return new Response(JSON.stringify({ error: "No API key found for this org. Please generate an API key first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The sync is now triggered by sending a request to the WP plugin.
    // The WP plugin already has the API key stored locally and authenticates itself.
    const siteUrl = site.url || `https://${site.domain}`;
    const wpEndpoint = `${siteUrl.replace(/\/$/, "")}/wp-json/actv-trkr/v1/sync`;

    console.log(`Triggering sync on ${wpEndpoint}`);

    const wpRes = await fetch(wpEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggered_from: "dashboard", key_hash: apiKeyRow.key_hash }),
    });

    if (!wpRes.ok) {
      const text = await wpRes.text();
      console.error(`WP sync failed: ${wpRes.status} ${text}`);
      return new Response(JSON.stringify({ error: `WordPress returned ${wpRes.status}`, details: text }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wpData = await wpRes.json();

    return new Response(JSON.stringify({ ok: true, wp_result: wpData }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("trigger-site-sync error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
