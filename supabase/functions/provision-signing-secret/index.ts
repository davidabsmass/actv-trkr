/**
 * provision-signing-secret
 *
 * SECURITY (C-2 — phase 1):
 *   This is the one-time bootstrap call that pushes a freshly-generated
 *   `signing_secret` from `api_keys.signing_secret` into the WordPress
 *   plugin (v1.18.1+). After this succeeds, every backend → plugin call
 *   carries an HMAC signature instead of the legacy stored hash.
 *
 *   The plugin's `/bootstrap-signing-secret` route is itself guarded by
 *   the legacy hash credential (it's the single transitional call where
 *   the legacy credential is intentionally accepted). The plugin refuses
 *   to overwrite an existing secret, so this call is idempotent and safe
 *   to retry.
 *
 *   Caller: org admin from the dashboard. Plugin must be v1.18.1+.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (step: string, details?: any) =>
    console.log(`[provision-signing-secret] [${requestId}] ${step}${details ? " - " + JSON.stringify(details) : ""}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { site_id } = await req.json().catch(() => ({}));
    if (!site_id || typeof site_id !== "string") {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: site } = await adminClient
      .from("sites")
      .select("id, domain, org_id")
      .eq("id", site_id)
      .single();
    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caller must be an org admin.
    const { data: membership } = await adminClient
      .from("org_users")
      .select("role")
      .eq("org_id", site.org_id)
      .eq("user_id", user.id)
      .single();
    if (!membership || membership.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: apiKeyRow } = await adminClient
      .from("api_keys")
      .select("key_hash, signing_secret")
      .eq("org_id", site.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!apiKeyRow?.signing_secret) {
      return new Response(JSON.stringify({ error: "No active API key with signing secret" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wpUrl = `https://${site.domain}/wp-json/actv-trkr/v1/bootstrap-signing-secret`;
    let resp: Response;
    try {
      resp = await fetch(wpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKeyRow.key_hash, // legacy creds are accepted ONLY for this one call
        },
        body: JSON.stringify({ signing_secret: apiKeyRow.signing_secret }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      log("wp_unreachable", { error: String(e) });
      return new Response(
        JSON.stringify({ error: "Could not reach WordPress site", details: String(e).slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 409 = already provisioned (idempotent success from our perspective).
    if (resp.status === 409) {
      log("already_provisioned");
      return new Response(JSON.stringify({ ok: true, already_provisioned: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      log("wp_error", { status: resp.status });
      return new Response(
        JSON.stringify({ error: `WordPress returned ${resp.status}`, details: errorText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await adminClient.rpc("log_security_event", {
      p_event_type: "signing_secret_provisioned",
      p_severity: "info",
      p_org_id: site.org_id,
      p_site_id: site.id,
      p_user_id: user.id,
      p_actor_type: "user",
      p_message: "HMAC signing secret pushed to WordPress plugin",
      p_metadata: {},
      p_request_id: requestId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("exception", { error: String(err) });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
