import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Validate API key
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate API key → get client_id
    const { data: clientId, error: authError } = await supabase.rpc(
      "validate_api_key",
      { key: apiKey }
    );

    if (authError || !clientId) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { source, event, attribution, visitor } = body;

    if (!event || !event.page_url) {
      return new Response(
        JSON.stringify({ error: "Missing required event data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Clamp occurred_at to ±24h of server time
    const now = new Date();
    let occurredAt = event.occurred_at
      ? new Date(event.occurred_at)
      : now;
    const diffHours =
      Math.abs(occurredAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours > 24) {
      occurredAt = now;
    }

    // Extract referrer domain
    let referrerDomain: string | null = null;
    if (event.referrer) {
      try {
        referrerDomain = new URL(event.referrer).hostname;
      } catch {
        referrerDomain = null;
      }
    }

    // Normalize page_path (strip querystring)
    let pagePath = event.page_path || "";
    try {
      const url = new URL(event.page_url);
      pagePath = url.pathname;
    } catch {
      // keep as-is
    }

    // Resolve source_id
    let sourceId: string | null = null;
    if (source?.domain) {
      const { data: existingSource } = await supabase
        .from("sources")
        .select("id")
        .eq("client_id", clientId)
        .eq("domain", source.domain)
        .maybeSingle();

      if (existingSource) {
        sourceId = existingSource.id;
      } else {
        const { data: newSource } = await supabase
          .from("sources")
          .insert({
            client_id: clientId,
            domain: source.domain,
            site_id: source.site_id,
            source_type: source.type || "wordpress",
            plugin_version: source.plugin_version,
          })
          .select("id")
          .single();
        sourceId = newSource?.id || null;
      }
    }

    // Insert pageview (idempotent via event_id)
    const pageviewData = {
      client_id: clientId,
      source_id: sourceId,
      occurred_at: occurredAt.toISOString(),
      event_id: event.event_id || null,
      visitor_id: visitor?.visitor_id || null,
      session_id: event.session_id || null,
      page_url: event.page_url,
      page_path: pagePath,
      title: event.title || null,
      referrer: event.referrer || null,
      referrer_domain: referrerDomain,
      utm_source: attribution?.utm_source || null,
      utm_medium: attribution?.utm_medium || null,
      utm_campaign: attribution?.utm_campaign || null,
      utm_term: attribution?.utm_term || null,
      utm_content: attribution?.utm_content || null,
      device: event.device || null,
      ip_hash: visitor?.ip_hash || null,
      user_agent_hash: null,
      raw_payload: body,
    };

    const { error: insertError } = await supabase
      .from("pageviews")
      .upsert(pageviewData, {
        onConflict: "client_id,event_id",
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.error("Pageview insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store pageview" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Upsert session
    if (event.session_id) {
      await supabase.rpc("upsert_session", {
        p_client_id: clientId,
        p_source_id: sourceId,
        p_session_id: event.session_id,
        p_visitor_id: visitor?.visitor_id || null,
        p_occurred_at: occurredAt.toISOString(),
        p_page_path: pagePath,
        p_referrer_domain: referrerDomain,
        p_utm_source: attribution?.utm_source || null,
        p_utm_medium: attribution?.utm_medium || null,
        p_utm_campaign: attribution?.utm_campaign || null,
      });
    }

    return new Response(
      JSON.stringify({ status: "ok", event_id: event.event_id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Pageview tracking error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
