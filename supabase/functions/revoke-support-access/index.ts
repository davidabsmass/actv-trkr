// Revoke Support Access — calls the plugin to delete the temp WP admin
// user and marks the grant row as revoked. Safe to call multiple times.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSignedHeaders } from "../_shared/hmac-sign.ts";

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
  const log = (step: string, details?: unknown) => {
    console.log(
      `[revoke-support-access] [${requestId}] ${step}${
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
    const { data: { user }, error: authError } = await userClient.auth
      .getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

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

    const { grant_id, reason } = await req.json();
    if (!grant_id || typeof grant_id !== "string") {
      return new Response(JSON.stringify({ error: "grant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: grant, error: gErr } = await admin
      .from("support_access_grants")
      .select("id, org_id, site_id, status, sites:site_id(domain)")
      .eq("id", grant_id)
      .single();
    if (gErr || !grant) {
      return new Response(JSON.stringify({ error: "Grant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (grant.status === "revoked" || grant.status === "expired") {
      return new Response(
        JSON.stringify({ ok: true, already: grant.status }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: apiKeyRow } = await admin
      .from("api_keys")
      .select("key_hash, signing_secret")
      .eq("org_id", grant.org_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let wpDeleted = false;
    let wpError: string | null = null;

    // Best-effort plugin call — if WordPress is down, we still mark revoked.
    if (apiKeyRow && (grant.sites as any)?.domain) {
      const wpUrl = `https://${
        (grant.sites as any).domain
      }/wp-json/actv-trkr/v1/support-access/revoke`;
      const wpBody = JSON.stringify({
        grant_id,
        reason: String(reason ?? "revoked_by_dashboard").slice(0, 200),
      });
      const signed = await buildSignedHeaders(
        apiKeyRow.signing_secret,
        null,
        wpBody,
      );
      try {
        const r = await fetch(wpUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKeyRow.key_hash,
            ...signed,
          },
          body: wpBody,
        });
        if (r.ok) {
          const j = await r.json();
          wpDeleted = !!j.deleted;
        } else {
          wpError = `wp_http_${r.status}`;
        }
      } catch (e) {
        wpError = "wp_unreachable";
        log("wp_fetch_failed", { error: String(e) });
      }
    } else {
      wpError = "no_api_key_or_domain";
    }

    // Mark the grant revoked regardless of WP outcome.
    await admin
      .from("support_access_grants")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: user.id,
        revoke_reason: String(reason ?? "revoked_by_dashboard").slice(0, 200),
        wp_user_deleted: wpDeleted,
      })
      .eq("id", grant_id);

    await admin.from("support_access_log").insert({
      grant_id,
      org_id: grant.org_id,
      site_id: grant.site_id,
      event_type: "grant_revoked",
      actor_type: "staff",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      message: wpDeleted
        ? "Grant revoked and temp WP user deleted"
        : "Grant marked revoked (WP deletion failed)",
      metadata: { wp_deleted: wpDeleted, wp_error: wpError, reason },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        grant_id,
        wp_deleted: wpDeleted,
        wp_error: wpError,
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
