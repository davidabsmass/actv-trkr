/**
 * issue-site-ingest-token
 *
 * Mints a narrow-scope ingest token for a single site, bound to a domain.
 * Called server-to-server from the WordPress plugin using the admin API key
 * (never exposed to JS). The returned token is what the plugin embeds in
 * page source for tracker.js — it can ONLY hit ingest endpoints.
 *
 * Auth:   X-Api-Key: <admin api key>  (or  Authorization: Bearer <admin api key>)
 * Body:   { domain: "example.com", rotate?: boolean }
 * Reply:  { ingest_token: "...", site_id, expires_at: null }
 *
 * Behavior:
 *   - If the site already has an active ingest token AND rotate=false: returns
 *     a new token and marks the old one as 'rotating' (grace period). The old
 *     token continues to authenticate for one hour, then is auto-revoked by a
 *     scheduled job (handled separately).
 *     NOTE: For now we just rotate immediately — the token itself is bearer
 *     and the plugin caches the latest, so no grace logic is required client-side.
 *   - If rotate=true: same as above (explicit rotation).
 *   - Tokens are stored as SHA-256 hashes; the raw token is returned exactly
 *     once and never recoverable.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { logSecurityEvent, hashIp, extractClientIp, newRequestId } from "../_shared/security-audit.ts";

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

function randomToken(): string {
  // 32 bytes -> 64 hex chars. Bearer-strength.
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDomain(d: string): string {
  return d.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "").toLowerCase().trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = newRequestId();
  const ip = extractClientIp(req);
  const ipHash = ip ? await hashIp(ip) : null;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminKey =
      req.headers.get("x-api-key") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

    if (!adminKey || adminKey.length < 16 || adminKey.length > 256) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NOTE: We previously rejected any 64-char hex string here as a defense
    // against feeding the stored key_hash back as a credential. That guard
    // had a false-positive: legitimate raw keys minted by onboarding are
    // also 64-char hex (sha256 of 32 random bytes is hex of length 64,
    // and so is 32 random bytes hex-encoded). Removing it — the hash
    // lookup below is the real protection: feeding a hash as the key
    // would just sha256 it again and miss every row.

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const keyHash = await sha256Hex(adminKey);
    const { data: akRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!akRow) {
      await logSecurityEvent({
        event_type: "ingest_token_mint_unauthorized",
        severity: "warn",
        actor_type: "plugin",
        message: "Invalid admin API key on issue-site-ingest-token",
        metadata: {},
        ip_hash: ipHash,
        request_id: requestId,
      });
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = akRow.org_id;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawDomain = typeof body?.domain === "string" ? body.domain : "";
    const domain = normalizeDomain(rawDomain);
    if (!domain || domain.length > 253 || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      return new Response(JSON.stringify({ error: "Invalid domain" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the site for this org/domain. Sites are auto-registered on
    // first ingest, so an admin key calling this for an unknown domain
    // is unusual — return a clear error rather than auto-create here.
    const { data: site } = await supabase
      .from("sites")
      .select("id, org_id, domain")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .maybeSingle();

    if (!site) {
      return new Response(
        JSON.stringify({
          error: "Site not registered for this org",
          hint: "Send a pageview from this domain first, then retry.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Mint new token
    const token = randomToken();
    const tokenHash = await sha256Hex(token);

    // Revoke any existing active token for this site.
    await supabase
      .from("site_ingest_tokens")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("site_id", site.id)
      .eq("status", "active");

    const { data: inserted, error: insertErr } = await supabase
      .from("site_ingest_tokens")
      .insert({
        org_id: orgId,
        site_id: site.id,
        token_hash: tokenHash,
        bound_domain: domain,
        scope: "ingest",
        status: "active",
        metadata: {
          minted_via: "issue-site-ingest-token",
          ip_hash: ipHash,
          user_agent: req.headers.get("user-agent") || null,
        },
      })
      .select("id, created_at")
      .single();

    if (insertErr || !inserted) {
      console.error("[issue-site-ingest-token] insert failed:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to mint token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logSecurityEvent({
      event_type: "ingest_token_minted",
      severity: "info",
      org_id: orgId,
      site_id: site.id,
      actor_type: "plugin",
      message: "Site ingest token minted",
      metadata: { domain, token_id: inserted.id },
      ip_hash: ipHash,
      request_id: requestId,
    });

    return new Response(
      JSON.stringify({
        ingest_token: token,
        site_id: site.id,
        token_id: inserted.id,
        bound_domain: domain,
        scope: "ingest",
        // Tokens don't expire by time — only by explicit rotation/revocation.
        expires_at: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[issue-site-ingest-token] exception:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
