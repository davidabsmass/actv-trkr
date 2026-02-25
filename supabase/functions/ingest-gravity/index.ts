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
    const { entry, context, fields } = body;

    if (!entry) {
      return new Response(
        JSON.stringify({ error: "Missing entry data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract page_path from source_url
    let pagePath: string | null = null;
    if (entry.source_url) {
      try {
        pagePath = new URL(entry.source_url).pathname;
      } catch {
        pagePath = null;
      }
    }

    // Resolve source_id from context
    let sourceId: string | null = null;
    if (context?.domain) {
      const { data: existingSource } = await supabase
        .from("sources")
        .select("id")
        .eq("client_id", clientId)
        .eq("domain", context.domain)
        .maybeSingle();
      sourceId = existingSource?.id || null;
    }

    const leadData = {
      client_id: clientId,
      source_id: sourceId,
      form_id: entry.form_id?.toString() || null,
      form_title: entry.form_title || null,
      submitted_at: entry.submitted_at || new Date().toISOString(),
      page_url: entry.source_url || null,
      page_path: pagePath,
      session_id: context?.session_id || null,
      visitor_id: context?.visitor_id || null,
      referrer: context?.referrer || null,
      utm_source: context?.utm?.utm_source || context?.utm_source || null,
      utm_medium: context?.utm?.utm_medium || context?.utm_medium || null,
      utm_campaign: context?.utm?.utm_campaign || context?.utm_campaign || null,
      utm_term: context?.utm?.utm_term || context?.utm_term || null,
      utm_content: context?.utm?.utm_content || context?.utm_content || null,
      fields: fields || [],
      raw_payload: body,
    };

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert(leadData)
      .select("id")
      .single();

    if (insertError) {
      console.error("Lead insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store lead" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ status: "ok", lead_id: lead.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Gravity ingestion error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
