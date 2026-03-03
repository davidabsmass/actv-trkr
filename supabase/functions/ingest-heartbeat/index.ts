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

    // Resolve site
    const { data: site } = await supabase.from("sites").select("id, status").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (!site) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const now = new Date().toISOString();

    // Insert heartbeat
    await supabase.from("site_heartbeats").insert({
      site_id: site.id,
      received_at: now,
      source: body.source || "js",
      meta: body.meta || {},
    });

    // Update last_heartbeat_at on site
    await supabase.from("sites").update({ last_heartbeat_at: now, status: "UP" }).eq("id", site.id);

    // If site was DOWN and we got a heartbeat, check if we should resolve incident
    if (site.status === "DOWN") {
      // Check for 2 recent heartbeats
      const { data: recentBeats } = await supabase
        .from("site_heartbeats")
        .select("id")
        .eq("site_id", site.id)
        .order("received_at", { ascending: false })
        .limit(2);

      if (recentBeats && recentBeats.length >= 2) {
        // Resolve open DOWNTIME incident
        const { data: openIncident } = await supabase
          .from("incidents")
          .select("id")
          .eq("site_id", site.id)
          .eq("type", "DOWNTIME")
          .is("resolved_at", null)
          .maybeSingle();

        if (openIncident) {
          await supabase.from("incidents").update({ resolved_at: now }).eq("id", openIncident.id);
        }
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Heartbeat error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
