import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate via API key (plugin uses hashed key)
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) throw new Error("Missing API key");

    const { createHash } = await import("https://deno.land/std@0.168.0/node/crypto.ts");
    const keyHash = createHash("sha256").update(apiKey).digest("hex");

    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!keyRow) throw new Error("Invalid API key");

    const { domain } = await req.json();
    if (!domain) throw new Error("Missing domain");

    // Find site by domain
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", keyRow.org_id)
      .eq("domain", domain.replace(/^www\./, ""))
      .maybeSingle();

    if (!site) throw new Error("Site not found");

    // Get pending fixes for this site
    const { data: fixes } = await supabase
      .from("seo_fix_queue")
      .select("id, page_url, issue_id, fix_type, fix_value")
      .eq("site_id", site.id)
      .eq("org_id", keyRow.org_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    return new Response(JSON.stringify({ fixes: fixes || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
