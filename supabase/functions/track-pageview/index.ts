import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    const body = await req.json();
    const { source, event, attribution, visitor } = body;
    if (!event?.page_url) return new Response(JSON.stringify({ error: "Missing event data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const now = new Date();
    let occurredAt = event.occurred_at ? new Date(event.occurred_at) : now;
    if (Math.abs(occurredAt.getTime() - now.getTime()) / 36e5 > 24) occurredAt = now;

    let referrerDomain: string | null = null;
    try { referrerDomain = new URL(event.referrer).hostname; } catch {}

    let pagePath = event.page_path || "";
    try { pagePath = new URL(event.page_url).pathname; } catch {}

    // Upsert site
    let siteId: string | null = null;
    if (source?.domain) {
      const { data: existing } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", source.domain).maybeSingle();
      if (existing) { siteId = existing.id; }
      else {
        const { data: ns } = await supabase.from("sites").insert({ org_id: orgId, domain: source.domain, type: source.type || "wordpress", plugin_version: source.plugin_version }).select("id").single();
        siteId = ns?.id || null;
      }
    }

    if (!siteId) return new Response(JSON.stringify({ error: "Missing source domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { error: insertError } = await supabase.from("pageviews").upsert({
      org_id: orgId, site_id: siteId, occurred_at: occurredAt.toISOString(),
      event_id: event.event_id, visitor_id: visitor?.visitor_id, session_id: event.session_id,
      page_url: event.page_url, page_path: pagePath, title: event.title,
      referrer: event.referrer, referrer_domain: referrerDomain,
      utm_source: attribution?.utm_source, utm_medium: attribution?.utm_medium,
      utm_campaign: attribution?.utm_campaign, utm_term: attribution?.utm_term,
      utm_content: attribution?.utm_content, device: event.device, ip_hash: visitor?.ip_hash,
    }, { onConflict: "org_id,site_id,event_id", ignoreDuplicates: true });

    if (insertError) { console.error("Pageview insert error:", insertError); return new Response(JSON.stringify({ error: "Failed to store pageview" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    if (event.session_id) {
      await supabase.rpc("upsert_session", {
        p_org_id: orgId, p_site_id: siteId, p_session_id: event.session_id,
        p_visitor_id: visitor?.visitor_id, p_occurred_at: occurredAt.toISOString(),
        p_page_path: pagePath, p_referrer_domain: referrerDomain,
        p_utm_source: attribution?.utm_source, p_utm_medium: attribution?.utm_medium, p_utm_campaign: attribution?.utm_campaign,
      });
    }

    return new Response(JSON.stringify({ status: "ok", event_id: event.event_id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Pageview tracking error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
