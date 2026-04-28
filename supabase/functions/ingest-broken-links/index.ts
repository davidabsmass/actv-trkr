import { createClient } from "npm:@supabase/supabase-js@2";
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
    const domain = (body.domain || "").replace(/^www\./i, "");
    const links = body.links;
    if (!domain || !Array.isArray(links)) return new Response(JSON.stringify({ error: "Missing domain or links" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    if (!site) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const now = new Date().toISOString();
    let upserted = 0;

    for (const link of links.slice(0, 500)) {
      if (!link.source_page || !link.broken_url) continue;

      const { data: existing } = await supabase
        .from("broken_links")
        .select("id, occurrences")
        .eq("site_id", site.id)
        .eq("broken_url", link.broken_url)
        .eq("source_page", link.source_page)
        .maybeSingle();

      if (existing) {
        await supabase.from("broken_links").update({
          last_seen_at: now,
          occurrences: (existing.occurrences || 1) + 1,
          status_code: link.status_code || null,
        }).eq("id", existing.id);
      } else {
        await supabase.from("broken_links").insert({
          site_id: site.id,
          org_id: orgId,
          source_page: link.source_page,
          broken_url: link.broken_url,
          status_code: link.status_code || null,
          first_seen_at: now,
          last_seen_at: now,
        });
      }
      upserted++;
    }

    return new Response(JSON.stringify({ status: "ok", upserted }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Broken links error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
