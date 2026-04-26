import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSignedHeaders } from "../_shared/hmac-sign.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOKEN_TTL_SECONDS = 900; // 15 minutes — must match plugin

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(bytes = 48): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
}

async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return await sha256Hex(`actv-trkr-ip-salt:${ip}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (step: string, details?: any) => {
    console.log(
      `[generate-wp-login] [${requestId}] ${step}${
        details ? " - " + JSON.stringify(details) : ""
      }`
    );
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      log("auth_failed");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { site_id } = await req.json();
    if (!site_id || typeof site_id !== "string") {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: site, error: siteError } = await adminClient
      .from("sites")
      .select("id, domain, org_id")
      .eq("id", site_id)
      .single();

    if (siteError || !site) {
      log("site_not_found", { site_id });
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: only org ADMINS may issue magic logins (not regular members)
    const { data: membership } = await adminClient
      .from("org_users")
      .select("role")
      .eq("org_id", site.org_id)
      .eq("user_id", user.id)
      .single();

    const ipHash = await hashIp(extractIp(req));
    const userAgent = req.headers.get("user-agent")?.slice(0, 500) || null;

    if (!membership || membership.role !== "admin") {
      // Audit the failure
      await adminClient.rpc("log_security_event", {
        p_event_type: "magic_login_authorization_denied",
        p_severity: "warn",
        p_org_id: site.org_id,
        p_site_id: site.id,
        p_user_id: user.id,
        p_actor_type: "user",
        p_message: "Non-admin attempted to issue WP magic login",
        p_metadata: { membership_role: membership?.role || null },
        p_ip_hash: ipHash,
        p_user_agent: userAgent,
        p_request_id: requestId,
      });
      log("not_admin", { role: membership?.role });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the org's API key (used to authenticate to the WP REST endpoint)
    const { data: apiKeyRow } = await adminClient
      .from("api_keys")
      .select("key_hash, signing_secret")
      .eq("org_id", site.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!apiKeyRow) {
      return new Response(
        JSON.stringify({
          error:
            "No active API key found for this organization. Generate one in Settings → API Keys.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const apiKey = apiKeyRow.key_hash;
    const signingSecret = apiKeyRow.signing_secret as string | null;

    // C-1 FIX: bind the magic-login token to the requestor BEFORE handing
    // it to WordPress. We mint the token here, register it in our DB,
    // and pass it through to WordPress for storage. WordPress then
    // calls back into our `verify-magic-login` endpoint when the URL
    // is consumed — which is the ONLY way the token becomes valid.
    const token = generateToken(48);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

    const { error: insertErr } = await adminClient
      .from("magic_login_tokens")
      .insert({
        org_id: site.org_id,
        site_id: site.id,
        requested_by_user_id: user.id,
        requested_by_email: user.email ?? null,
        token_hash: tokenHash,
        requestor_ip_hash: ipHash,
        requestor_user_agent: userAgent,
        expires_at: expiresAt.toISOString(),
      });
    if (insertErr) {
      log("token_insert_failed", { error: insertErr.message });
      return new Response(
        JSON.stringify({ error: "Failed to issue token" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Audit issuance
    await adminClient.rpc("log_security_event", {
      p_event_type: "magic_login_token_issued",
      p_severity: "info",
      p_org_id: site.org_id,
      p_site_id: site.id,
      p_user_id: user.id,
      p_actor_type: "user",
      p_message: "WP magic login token issued",
      p_metadata: { expires_at: expiresAt.toISOString() },
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
      p_request_id: requestId,
    });

    // Call the WordPress site's magic-login REST endpoint with the
    // backend-minted token. Older plugin versions ignore the `token`
    // field and mint their own — for those, we still record the
    // server-side token but the plugin's autonomous flow is preserved.
    const wpUrl = `https://${site.domain}/wp-json/actv-trkr/v1/magic-login`;
    const wpBody = JSON.stringify({
      token,
      expires_at: expiresAt.toISOString(),
      ttl_seconds: TOKEN_TTL_SECONDS,
    });
    const signedHeaders = await buildSignedHeaders(signingSecret, null, wpBody);
    let wpResponse: Response;
    try {
      wpResponse = await fetch(wpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Legacy hash header — accepted by v1.18.x for backwards compat,
          // ignored when the signed headers below verify successfully.
          "X-Api-Key": apiKey,
          ...signedHeaders,
        },
        body: wpBody,
      });
    } catch (e) {
      log("wp_unreachable", { error: String(e) });
      return new Response(
        JSON.stringify({
          error: "Could not reach WordPress site",
          details: String(e).slice(0, 200),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      log("wp_error", { status: wpResponse.status });
      return new Response(
        JSON.stringify({
          error: `WordPress returned ${wpResponse.status}`,
          details: errorText.substring(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const wpData = await wpResponse.json();

    return new Response(
      JSON.stringify({
        login_url: wpData.login_url,
        expires_in: wpData.expires_in ?? TOKEN_TTL_SECONDS,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    log("exception", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
