import { createClient } from "npm:@supabase/supabase-js@2";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Hash the API key and look it up
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!apiKeyRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = apiKeyRow.org_id;
    const body = await req.json();
    const { domain, checks } = body;

    if (!domain || !Array.isArray(checks)) {
      return new Response(JSON.stringify({ error: "Missing domain or checks array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve site_id from domain
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found for domain" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let upserted = 0;
    let alertsCreated = 0;

    for (const check of checks) {
      const { form_id, provider, rendered, page_url, http_status, failure_reason } = check;
      if (!form_id || !provider) continue;

      // Resolve internal form_id from external_form_id + provider
      const { data: formRow } = await supabase
        .from("forms")
        .select("id")
        .eq("org_id", orgId)
        .eq("site_id", site.id)
        .eq("external_form_id", String(form_id))
        .eq("provider", provider)
        .maybeSingle();

      if (!formRow) continue;

      // Update form's page_url if provided
      if (page_url) {
        await supabase
          .from("forms")
          .update({ page_url })
          .eq("id", formRow.id);
      }

      // Get current state to detect transitions
      const { data: existing } = await supabase
        .from("form_health_checks")
        .select("is_rendered")
        .eq("org_id", orgId)
        .eq("site_id", site.id)
        .eq("form_id", formRow.id)
        .maybeSingle();

      const wasRendered = existing?.is_rendered ?? true;
      const isRendered = !!rendered;
      const now = new Date().toISOString();
      const statusValue = typeof http_status === "number" ? http_status : null;
      const reasonValue = isRendered
        ? null
        : (typeof failure_reason === "string" && failure_reason.trim()
          ? failure_reason.trim().slice(0, 200)
          : (statusValue !== null
            ? (statusValue === 404 || statusValue === 410
              ? `Page not found (HTTP ${statusValue})`
              : statusValue >= 500
                ? `Server error (HTTP ${statusValue})`
                : statusValue >= 400
                  ? `Page blocked or unavailable (HTTP ${statusValue})`
                  : `Page returned ${statusValue} but form markup not detected`)
            : "Form markup not detected on page"));

      // Upsert the health check
      const upsertData: Record<string, unknown> = {
        org_id: orgId,
        site_id: site.id,
        form_id: formRow.id,
        is_rendered: isRendered,
        page_url: page_url || null,
        last_checked_at: now,
        last_http_status: statusValue,
        last_failure_reason: reasonValue,
      };
      if (isRendered) {
        upsertData.last_rendered_at = now;
      }

      await supabase
        .from("form_health_checks")
        .upsert(upsertData, { onConflict: "org_id,site_id,form_id" });

      upserted++;

      // If transitioned from rendered → not rendered, create alert
      if (wasRendered && !isRendered) {
        await supabase.from("monitoring_alerts").insert({
          org_id: orgId,
          site_id: site.id,
          alert_type: "FORM_NOT_RENDERED",
          severity: "critical",
          subject: `Form not found on page`,
          message: `The form (${provider} #${form_id}) was not detected on ${page_url || "its page"}. It may have been removed or the page structure changed.`,
          status: "queued",
        });
        alertsCreated++;
      }
    }

    return new Response(JSON.stringify({ ok: true, upserted, alerts_created: alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ingest-form-health error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
