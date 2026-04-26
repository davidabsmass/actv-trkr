// Backend verifier for WordPress magic-login tokens.
//
// The WordPress plugin (v1.9.16+) calls this endpoint when a visitor
// hits a magic-login URL. This is the SOLE authority on whether a
// magic-login token is valid:
//
//   - The token must exist in `magic_login_tokens`
//   - It must not be expired
//   - It must not have been previously consumed
//   - It must not have been revoked
//   - The site_id from the token must match the calling site's API key
//
// Atomic single-use is enforced by an UPDATE ... WHERE consumed_at IS NULL
// guard so two concurrent requests can never both succeed.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
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
      `[verify-magic-login] [${requestId}] ${step}${
        details ? " - " + JSON.stringify(details) : ""
      }`
    );
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const apiKey = req.headers.get("x-api-key") || "";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve API key → org. Stored value is the raw key (legacy);
    // accept both raw match and SHA-256 of raw → sent value.
    const apiKeyHash = await sha256Hex(apiKey);
    const { data: apiKeyRow } = await adminClient
      .from("api_keys")
      .select("org_id, revoked_at")
      .or(`key_hash.eq.${apiKey},key_hash.eq.${apiKeyHash}`)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();

    if (!apiKeyRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenHash = await sha256Hex(token);
    const ipHash = await hashIp(extractIp(req));

    // Look up the token
    const { data: tokenRow } = await adminClient
      .from("magic_login_tokens")
      .select(
        "id, org_id, site_id, requested_by_user_id, requested_by_email, expires_at, consumed_at, revoked_at"
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!tokenRow) {
      await adminClient.rpc("log_security_event", {
        p_event_type: "magic_login_unknown_token",
        p_severity: "warn",
        p_org_id: apiKeyRow.org_id,
        p_actor_type: "site",
        p_message: "Magic login verification with unknown token",
        p_metadata: {},
        p_ip_hash: ipHash,
        p_request_id: requestId,
      });
      return new Response(JSON.stringify({ valid: false, reason: "unknown" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenRow.org_id !== apiKeyRow.org_id) {
      await adminClient.rpc("log_security_event", {
        p_event_type: "magic_login_org_mismatch",
        p_severity: "error",
        p_org_id: apiKeyRow.org_id,
        p_site_id: tokenRow.site_id,
        p_actor_type: "site",
        p_message:
          "Site attempted to consume magic login token bound to a different org",
        p_metadata: { token_org: tokenRow.org_id },
        p_ip_hash: ipHash,
        p_request_id: requestId,
      });
      return new Response(
        JSON.stringify({ valid: false, reason: "org_mismatch" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (tokenRow.revoked_at) {
      return new Response(
        JSON.stringify({ valid: false, reason: "revoked" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ valid: false, reason: "expired" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (tokenRow.consumed_at) {
      await adminClient.rpc("log_security_event", {
        p_event_type: "magic_login_replay_attempt",
        p_severity: "warn",
        p_org_id: tokenRow.org_id,
        p_site_id: tokenRow.site_id,
        p_actor_type: "site",
        p_message: "Magic login token replay blocked",
        p_metadata: { previously_consumed_at: tokenRow.consumed_at },
        p_ip_hash: ipHash,
        p_request_id: requestId,
      });
      return new Response(
        JSON.stringify({ valid: false, reason: "already_used" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ATOMIC single-use: only succeed if consumed_at is still NULL.
    const { data: consumed, error: consumeErr } = await adminClient
      .from("magic_login_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        consumed_ip_hash: ipHash,
      })
      .eq("id", tokenRow.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();

    if (consumeErr || !consumed) {
      // Lost the race — another concurrent verify won.
      return new Response(
        JSON.stringify({ valid: false, reason: "race_lost" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await adminClient.rpc("log_security_event", {
      p_event_type: "magic_login_token_consumed",
      p_severity: "info",
      p_org_id: tokenRow.org_id,
      p_site_id: tokenRow.site_id,
      p_user_id: tokenRow.requested_by_user_id,
      p_actor_type: "site",
      p_message: "Magic login token consumed successfully",
      p_metadata: {},
      p_ip_hash: ipHash,
      p_request_id: requestId,
    });

    return new Response(
      JSON.stringify({
        valid: true,
        requested_by: tokenRow.requested_by_user_id,
        requested_by_email: tokenRow.requested_by_email ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    log("exception", { error: String(err) });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
