import { createClient } from "npm:@supabase/supabase-js@2";
import { observe } from "../_shared/observability.ts";

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
    const { entry, context, fields } = body;
    if (!entry) return new Response(JSON.stringify({ error: "Missing entry data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Resolve site
    const domain = context?.domain;
    if (!domain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    const siteId = site?.id;
    if (!siteId) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Upsert form
    const extFormId = entry.form_id?.toString() || "unknown";
    const { data: formRow, error: formErr } = await supabase.from("forms").upsert({
      org_id: orgId,
      site_id: siteId,
      provider: "gravity_forms",
      external_form_id: extFormId,
      name: entry.form_title || "Untitled Form",
    }, {
      onConflict: "site_id,provider,external_form_id",
    }).select("id").single();
    if (formErr || !formRow) return new Response(JSON.stringify({ error: "Failed to create form" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const formId = formRow.id;

    // Insert raw event
    const extEntryId = entry.entry_id?.toString() || `${Date.now()}`;
    await supabase.from("lead_events_raw").upsert({
      org_id: orgId, site_id: siteId, form_id: formId,
      external_entry_id: extEntryId, submitted_at: entry.submitted_at || new Date().toISOString(),
      payload: body, context: context || {},
      visitor_id: context?.visitor_id, session_id: context?.session_id,
    }, { onConflict: "org_id,site_id,form_id,external_entry_id", ignoreDuplicates: true });

    // Normalize lead
    let pagePath: string | null = null;
    if (entry.source_url) { try { pagePath = new URL(entry.source_url).pathname; } catch {} }

    const utmSource = context?.utm?.utm_source || context?.utm_source || null;
    const utmMedium = context?.utm?.utm_medium || context?.utm_medium || null;
    const utmCampaign = context?.utm?.utm_campaign || context?.utm_campaign || null;
    let referrerDomain: string | null = null;
    if (context?.referrer) { try { referrerDomain = new URL(context.referrer).hostname; } catch {} }

    const source = utmSource || referrerDomain || "direct";
    const medium = utmMedium || (referrerDomain ? "referral" : "direct");

    const { data: lead, error: leadErr } = await supabase.from("leads").insert({
      org_id: orgId, site_id: siteId, form_id: formId,
      submitted_at: entry.submitted_at || new Date().toISOString(),
      page_url: entry.source_url, page_path: pagePath,
      referrer: context?.referrer, referrer_domain: referrerDomain,
      utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign,
      utm_term: context?.utm?.utm_term, utm_content: context?.utm?.utm_content,
      source, medium, campaign: utmCampaign,
      visitor_id: context?.visitor_id, session_id: context?.session_id,
      data: fields || {},
    }).select("id").single();

    if (leadErr) { console.error("Lead insert error:", leadErr); return new Response(JSON.stringify({ error: "Failed to store lead" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    // Populate lead_fields_flat — skip metadata keys and non-data field types
    const SKIP_KEYS = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);
    const SKIP_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);

    if (fields && Array.isArray(fields)) {
      const flatRows = fields
        .filter((f: any) => {
          if (!f.value && f.value !== 0) return false;
          const key = f.id?.toString() || f.label || "unknown";
          if (SKIP_KEYS.has(key)) return false;
          if (SKIP_TYPES.has((f.type || "").toLowerCase())) return false;
          return true;
        })
        .map((f: any) => ({
          org_id: orgId, lead_id: lead.id,
          field_key: f.id?.toString() || f.label || "unknown",
          field_label: f.label || f.id?.toString(),
          field_type: f.type || "text",
          value_text: f.value?.toString() || null,
        }));
      if (flatRows.length > 0) await supabase.from("lead_fields_flat").insert(flatRows);
    }

    return new Response(JSON.stringify({ status: "ok", lead_id: lead.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Gravity ingestion error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
