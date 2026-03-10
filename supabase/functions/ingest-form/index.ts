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

async function hashFingerprint(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// In-memory dedup cache (survives within a single isolate lifetime)
const recentFingerprints = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 30_000; // 30s window
  for (const [k, v] of recentFingerprints) {
    if (v < cutoff) recentFingerprints.delete(k);
  }
}, 60_000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Auth
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase.from("api_keys").select("org_id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
    if (!akRow) return new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orgId = akRow.org_id;

    const body = await req.json();
    const { entry, context, fields, provider } = body;
    if (!entry) return new Response(JSON.stringify({ error: "Missing entry data" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const providerName = provider || "unknown";

    // Resolve site
    const domain = context?.domain;
    if (!domain) return new Response(JSON.stringify({ error: "Missing domain" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: site } = await supabase.from("sites").select("id").eq("org_id", orgId).eq("domain", domain).maybeSingle();
    const siteId = site?.id;
    if (!siteId) return new Response(JSON.stringify({ error: "Unknown site" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // --- Deduplication ---
    // Build a fingerprint from: domain + page_url + sorted field values + timestamp rounded to 10s
    const pageUrl = entry.source_url || entry.page_url || "";
    const fieldValues = (Array.isArray(fields) ? fields : [])
      .map((f: any) => `${f.name || f.id || f.label || ""}=${f.value || ""}`)
      .sort()
      .join("&");
    const tsRounded = Math.floor(Date.now() / 10_000).toString();
    const fingerprint = await hashFingerprint([orgId, domain, pageUrl, fieldValues, tsRounded]);

    // If JS capture arrives and a server-side hook already sent the same submission, skip
    if (providerName === "js_capture" && recentFingerprints.has(fingerprint)) {
      return new Response(JSON.stringify({ status: "deduplicated", provider: providerName }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // If server-side hook arrives and JS already captured, the server-side wins — we'll update below
    const jsAlreadyCaptured = recentFingerprints.has(fingerprint);
    recentFingerprints.set(fingerprint, Date.now());

    // Upsert form
    const extFormId = entry.form_id?.toString() || `dom_form_${fingerprint.slice(0, 8)}`;
    let formId: string;
    const { data: existingForm } = await supabase.from("forms")
      .select("id")
      .eq("org_id", orgId).eq("site_id", siteId).eq("external_form_id", extFormId)
      .maybeSingle();

    if (existingForm) {
      formId = existingForm.id;
    } else {
      const formName = entry.form_title || entry.form_name || `Form (${providerName})`;
      const { data: nf, error: nfErr } = await supabase.from("forms")
        .insert({ org_id: orgId, site_id: siteId, external_form_id: extFormId, name: formName, provider: providerName })
        .select("id").single();
      if (nfErr || !nf) return new Response(JSON.stringify({ error: "Failed to create form" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      formId = nf.id;
    }

    // Insert raw event
    const extEntryId = entry.entry_id?.toString() || `${providerName}_${fingerprint.slice(0, 16)}`;
    await supabase.from("lead_events_raw").upsert({
      org_id: orgId, site_id: siteId, form_id: formId,
      external_entry_id: extEntryId,
      submitted_at: entry.submitted_at || new Date().toISOString(),
      payload: body, context: context || {},
      visitor_id: context?.visitor_id, session_id: context?.session_id,
    }, { onConflict: "org_id,site_id,form_id,external_entry_id", ignoreDuplicates: true });

    // Normalize lead
    let pagePath: string | null = null;
    if (pageUrl) { try { pagePath = new URL(pageUrl).pathname; } catch { /* ignore */ } }

    const utmSource = context?.utm?.utm_source || context?.utm_source || null;
    const utmMedium = context?.utm?.utm_medium || context?.utm_medium || null;
    const utmCampaign = context?.utm?.utm_campaign || context?.utm_campaign || null;
    let referrerDomain: string | null = null;
    if (context?.referrer) { try { referrerDomain = new URL(context.referrer).hostname; } catch { /* ignore */ } }

    // Detect self-referral (source = own domain) and treat as direct
    let siteDomain: string | null = null;
    if (pageUrl) { try { siteDomain = new URL(pageUrl).hostname; } catch { /* ignore */ } }
    const isSelfReferral = referrerDomain && siteDomain && referrerDomain === siteDomain;

    const source = utmSource || (isSelfReferral ? "direct" : referrerDomain) || "direct";
    const medium = utmMedium || (referrerDomain && !isSelfReferral ? "referral" : "direct");

    const { data: lead, error: leadErr } = await supabase.from("leads").insert({
      org_id: orgId, site_id: siteId, form_id: formId,
      submitted_at: entry.submitted_at || new Date().toISOString(),
      page_url: pageUrl || null, page_path: pagePath,
      referrer: context?.referrer, referrer_domain: referrerDomain,
      utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign,
      utm_term: context?.utm?.utm_term, utm_content: context?.utm?.utm_content,
      source, medium, campaign: utmCampaign,
      visitor_id: context?.visitor_id, session_id: context?.session_id,
      data: fields || {},
      lead_type: providerName,
    }).select("id").single();

    if (leadErr) {
      console.error("Lead insert error:", leadErr);
      return new Response(JSON.stringify({ error: "Failed to store lead" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Populate lead_fields_flat — skip metadata keys and non-data field types
    const SKIP_KEYS = new Set(["data", "submission", "field_labels", "field_types", "field_keys", "hidden_field_names", "fields_holding_privacy_data"]);
    const SKIP_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page"]);

    if (fields && Array.isArray(fields)) {
      // Check for Avada comma-separated format
      const dataEntry = fields.find((f: any) => f.name === "data" || f.label === "data");
      const typesEntry = fields.find((f: any) => f.name === "field_types" || f.label === "field_types");

      if (dataEntry?.value && typesEntry?.value && providerName === "avada") {
        // Parse Avada comma-separated format
        const SKIP_AVADA_TYPES = new Set(["submit", "notice", "html", "hidden", "captcha", "honeypot", "section", "page", "checkbox"]);
        const values = dataEntry.value.split(", ").map((v: string) => v.trim());
        const types = typesEntry.value.split(", ").map((t: string) => t.trim());
        const labelsEntry = fields.find((f: any) => f.name === "field_labels" || f.label === "field_labels");
        const labels = labelsEntry?.value ? labelsEntry.value.split(", ").map((l: string) => l.trim()) : [];

        const flatRows: any[] = [];
        let valueIdx = 0;
        for (let i = 0; i < types.length; i++) {
          const type = types[i]?.toLowerCase();
          if (SKIP_AVADA_TYPES.has(type)) continue;
          const val = values[valueIdx] || "";
          valueIdx++;
          if (!val || val === "Array") continue;
          const label = (labels[valueIdx - 1] && labels[valueIdx - 1] !== "") ? labels[valueIdx - 1] : `Field ${valueIdx}`;
          flatRows.push({
            org_id: orgId, lead_id: lead.id,
            field_key: label.toLowerCase().replace(/\s+/g, "_"),
            field_label: label,
            field_type: type,
            value_text: val,
          });
        }
        if (flatRows.length > 0) await supabase.from("lead_fields_flat").insert(flatRows);
      } else {
        // Standard field array format
        const flatRows = fields
          .filter((f: any) => {
            if (f.value === undefined || f.value === null || f.value === "") return false;
            const key = f.name || f.id?.toString() || f.label || "unknown";
            if (SKIP_KEYS.has(key)) return false;
            if (SKIP_TYPES.has((f.type || "").toLowerCase())) return false;
            return true;
          })
          .map((f: any) => ({
            org_id: orgId, lead_id: lead.id,
            field_key: f.name || f.id?.toString() || f.label || "unknown",
            field_label: f.label || f.name || f.id?.toString(),
            field_type: f.type || "text",
            value_text: f.value?.toString() || null,
          }));
        if (flatRows.length > 0) await supabase.from("lead_fields_flat").insert(flatRows);
      }
    }

    return new Response(JSON.stringify({ status: "ok", lead_id: lead.id, provider: providerName, deduplicated_js: jsAlreadyCaptured }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Form ingestion error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
