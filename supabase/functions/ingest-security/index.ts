import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate API key
    const keyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    const hashHex = Array.from(new Uint8Array(keyHash)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", hashHex)
      .is("revoked_at", null)
      .maybeSingle();

    if (!keyRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const orgId = keyRow.org_id;
    const body = await req.json();
    const { site_domain, events } = body;

    if (!site_domain || !Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ error: "Missing site_domain or events" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Look up site
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", site_domain)
      .maybeSingle();

    if (!site) return new Response(JSON.stringify({ error: "Site not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Insert events
    const rows = events.map((e: any) => ({
      org_id: orgId,
      site_id: site.id,
      event_type: e.event_type,
      severity: e.severity || "info",
      title: e.title || "",
      details: e.details || {},
      occurred_at: e.occurred_at || new Date().toISOString(),
    }));

    const { error } = await supabase.from("security_events").insert(rows);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ingest-security error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
