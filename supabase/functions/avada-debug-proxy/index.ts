import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { site_id } = await req.json();
    if (!site_id) {
      return new Response(JSON.stringify({ error: "Missing site_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: site } = await supabase
      .from("sites").select("id, domain, org_id, url")
      .eq("id", site_id).maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: apiKeyRow } = await supabase
      .from("api_keys").select("key_hash")
      .eq("org_id", site.org_id).is("revoked_at", null)
      .limit(1).maybeSingle();

    if (!apiKeyRow?.key_hash) {
      return new Response(JSON.stringify({ error: "No API key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteUrl = (site.url || `https://${site.domain}`).replace(/\/$/, "");
    const endpoints = [
      `${siteUrl}/wp-json/actv-trkr/v1/avada-debug`,
      `${siteUrl}/?rest_route=/actv-trkr/v1/avada-debug`,
    ];

    for (const endpoint of endpoints) {
      console.log(`Calling avada-debug: ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_hash: apiKeyRow.key_hash }),
      });

      if (res.ok) {
        const data = await res.json();
        return new Response(JSON.stringify({ ok: true, endpoint, ...data }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = await res.text();
      console.error(`avada-debug failed (${endpoint}): ${res.status} ${text}`);
      
      if (res.status === 404 && text.toLowerCase().includes("rest_no_route")) continue;
      
      return new Response(JSON.stringify({ error: `WP returned ${res.status}`, details: text, endpoint }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "avada-debug endpoint not found on WordPress" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("avada-debug-proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
