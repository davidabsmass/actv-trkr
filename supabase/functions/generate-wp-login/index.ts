import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the dashboard user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { site_id } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to look up the site and its org's API key
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get the site domain and org_id
    const { data: site, error: siteError } = await adminClient
      .from("sites")
      .select("id, domain, org_id")
      .eq("id", site_id)
      .single();

    if (siteError || !site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is a member of this org
    const { data: membership } = await adminClient
      .from("org_users")
      .select("role")
      .eq("org_id", site.org_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["admin", "member"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the org's API key (unhashed – we need the raw key the plugin has stored)
    const { data: apiKeyRow } = await adminClient
      .from("api_keys")
      .select("key_hash")
      .eq("org_id", site.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!apiKeyRow) {
      return new Response(
        JSON.stringify({ error: "No active API key found for this organization. Generate one in Settings → API Keys." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // The key_hash stored in DB is the raw key (it's displayed to user once).
    // We'll pass it as X-Api-Key to the WP REST endpoint.
    const apiKey = apiKeyRow.key_hash;

    // Call the WordPress site's magic-login REST endpoint
    const wpUrl = `https://${site.domain}/wp-json/actv-trkr/v1/magic-login`;

    const wpResponse = await fetch(wpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      return new Response(
        JSON.stringify({
          error: `WordPress returned ${wpResponse.status}`,
          details: errorText.substring(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const wpData = await wpResponse.json();

    return new Response(
      JSON.stringify({
        login_url: wpData.login_url,
        expires_in: wpData.expires_in,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
