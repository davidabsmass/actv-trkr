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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Auth — same pattern as ingest-form
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const keyHash = await hashKey(apiKey);
    const { data: akRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!akRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = akRow.org_id;
    const body = await req.json();
    const { forms, domain } = body;

    if (!Array.isArray(forms) || forms.length === 0) {
      return new Response(JSON.stringify({ error: "Missing forms array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!domain) {
      return new Response(JSON.stringify({ error: "Missing domain" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve site
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found for domain: " + domain }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteId = site.id;
    let synced = 0;

    for (const f of forms) {
      const formId = String(f.form_id || "");
      const formTitle = String(f.form_title || "Untitled Form");
      const provider = String(f.provider || "unknown");
      const pageUrl = f.page_url ? String(f.page_url) : null;

      if (!formId) continue;

      const upsertData: Record<string, unknown> = {
        org_id: orgId,
        site_id: siteId,
        external_form_id: formId,
        name: formTitle,
        provider,
      };

      // Only update page_url if we have one (don't overwrite existing with null)
      if (pageUrl) {
        upsertData.page_url = pageUrl;
      }

      const { error } = await supabase
        .from("forms")
        .upsert(upsertData, { onConflict: "site_id,provider,external_form_id" });

      if (!error) synced++;
    }

    return new Response(
      JSON.stringify({ ok: true, synced }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-forms error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
