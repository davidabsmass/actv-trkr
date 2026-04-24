// Grant Support Access — orchestrates creation of a temp WP admin user
// and returns a one-time magic-login URL for ACTV TRKR support staff.
//
// Flow:
//   1. Authenticate the caller (must be a system admin via has_role).
//   2. Insert a `support_access_grants` row (status=pending).
//   3. Mint a server-side magic-login token (stored in `magic_login_tokens`).
//   4. Call the plugin's /support-access/grant endpoint with HMAC signing,
//      which creates the temp WP user + stores the token locally.
//   5. On success: flip the grant row to `active` and return login_url.
//   6. On failure: mark the grant as `revoked` with reason=provision_failed.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { buildSignedHeaders } from "../_shared/hmac-sign.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_DURATIONS = [1, 24, 72];

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = (step: string, details?: unknown) => {
    console.log(
      `[grant-support-access] [${requestId}] ${step}${
        details ? " - " + JSON.stringify(details) : ""
      }`,
    );
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Only system admins (has_role 'admin') may grant support access.
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const siteId: string | undefined = body?.site_id;
    const durationHours: number = Number(body?.duration_hours ?? 24);
    const reason: string = String(body?.reason ?? "").slice(0, 500);

    if (!siteId || typeof siteId !== "string") {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_DURATIONS.includes(durationHours)) {
      return new Response(
        JSON.stringify({ error: "duration_hours must be 1, 24, or 72" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: site, error: siteErr } = await admin
      .from("sites")
      .select("id, domain, org_id")
      .eq("id", siteId)
      .single();
    if (siteErr || !site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the org's API key + signing secret (same as generate-wp-login).
    const { data: apiKeyRow } = await admin
      .from("api_keys")
      .select("key_hash, signing_secret")
      .eq("org_id", site.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!apiKeyRow) {
      return new Response(
        JSON.stringify({
          error:
            "No active API key for this organization. Generate one in Settings → API Keys before granting support access.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1. Create the grant row (pending).
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);
    const { data: grant, error: grantErr } = await admin
      .from("support_access_grants")
      .insert({
        org_id: site.org_id,
        site_id: site.id,
        granted_by_user_id: user.id,
        granted_by_email: user.email ?? null,
        duration_hours: durationHours,
        expires_at: expiresAt.toISOString(),
        status: "pending",
        metadata: { reason },
      })
      .select("id")
      .single();

    if (grantErr || !grant) {
      log("grant_insert_failed", { error: grantErr?.message });
      return new Response(
        JSON.stringify({ error: "Failed to create grant row" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Mint the magic-login token and register it (for the backend verifier).
    const token = generateToken(48);
    const tokenHash = await sha256Hex(token);
    const ipHash = await sha256Hex(
      `actv-trkr-ip-salt:${extractIp(req) ?? ""}`,
    );

    const { error: tokenErr } = await admin
      .from("magic_login_tokens")
      .insert({
        org_id: site.org_id,
        site_id: site.id,
        requested_by_user_id: user.id,
        requested_by_email: user.email ?? null,
        token_hash: tokenHash,
        requestor_ip_hash: ipHash,
        requestor_user_agent:
          req.headers.get("user-agent")?.slice(0, 500) ?? null,
        expires_at: expiresAt.toISOString(),
      });
    if (tokenErr) {
      log("token_insert_failed", { error: tokenErr.message });
      await admin
        .from("support_access_grants")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoke_reason: "token_mint_failed",
        })
        .eq("id", grant.id);
      return new Response(
        JSON.stringify({ error: "Failed to issue token" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Call the plugin /support-access/grant endpoint.
    const wpUrl =
      `https://${site.domain}/wp-json/actv-trkr/v1/support-access/grant`;
    const wpBody = JSON.stringify({
      grant_id: grant.id,
      requested_by_email: user.email,
      duration_hours: durationHours,
      reason,
      token,
    });
    const signed = await buildSignedHeaders(
      apiKeyRow.signing_secret,
      null,
      wpBody,
    );

    let wpRes: Response;
    try {
      wpRes = await fetch(wpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKeyRow.key_hash,
          ...signed,
        },
        body: wpBody,
      });
    } catch (e) {
      log("wp_unreachable", { error: String(e) });
      await admin
        .from("support_access_grants")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoke_reason: "wp_unreachable",
        })
        .eq("id", grant.id);
      return new Response(
        JSON.stringify({
          error: "Could not reach the WordPress site",
          details: String(e).slice(0, 200),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!wpRes.ok) {
      const errText = await wpRes.text();
      log("wp_error", { status: wpRes.status, body: errText.slice(0, 300) });
      await admin
        .from("support_access_grants")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoke_reason: `wp_http_${wpRes.status}`,
        })
        .eq("id", grant.id);
      return new Response(
        JSON.stringify({
          error: `WordPress returned ${wpRes.status}`,
          details: errText.slice(0, 400),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const wpData = await wpRes.json();

    // 4. Activate the grant.
    await admin
      .from("support_access_grants")
      .update({
        status: "active",
        wp_temp_username: wpData.username ?? null,
        wp_user_created: true,
        metadata: {
          reason,
          wp_user_id: wpData.user_id ?? null,
          activated_at: new Date().toISOString(),
        },
      })
      .eq("id", grant.id);

    await admin.from("support_access_log").insert({
      grant_id: grant.id,
      org_id: site.org_id,
      site_id: site.id,
      event_type: "grant_created",
      actor_type: "staff",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      message: "Support access grant provisioned",
      metadata: {
        duration_hours: durationHours,
        username: wpData.username ?? null,
      },
    });

    return new Response(
      JSON.stringify({
        grant_id: grant.id,
        login_url: wpData.login_url,
        username: wpData.username,
        expires_at: expiresAt.toISOString(),
        duration_hours: durationHours,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    log("exception", { error: String(err) });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
