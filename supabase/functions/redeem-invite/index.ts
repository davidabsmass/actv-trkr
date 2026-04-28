import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await anonClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Invite code required" }), {
        status: 400,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Use service role to look up and redeem the code
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Find the invite code
    const { data: invite, error: invErr } = await admin
      .from("invite_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .single();

    if (invErr || !invite) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invite code" }),
        {
          status: 400,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invite code has expired" }),
        {
          status: 400,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Check max uses
    if (invite.max_uses > 0 && invite.use_count >= invite.max_uses) {
      return new Response(
        JSON.stringify({ error: "This invite code has reached its usage limit" }),
        {
          status: 400,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Check if user is already a member
    const { data: existing } = await admin
      .from("org_users")
      .select("id")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "You are already a member of this organization" }),
        {
          status: 400,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Atomically increment use count FIRST to prevent race condition
    // If max_uses is exceeded, this will return 0 rows updated
    const { data: updated, error: rpcErr } = await admin.rpc("increment_invite_use", {
      p_invite_id: invite.id,
    });

    // If the RPC returns false/null or errors, the invite was consumed by another request
    if (rpcErr || updated === false) {
      return new Response(
        JSON.stringify({ error: "This invite code has reached its usage limit" }),
        {
          status: 400,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Add user to org as member
    const { error: joinErr } = await admin
      .from("org_users")
      .insert({ org_id: invite.org_id, user_id: user.id, role: "viewer" });

    if (joinErr) {
      console.error("Join error:", joinErr);
      return new Response(
        JSON.stringify({ error: "Failed to join organization" }),
        {
          status: 500,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        }
      );
    }

    // Get org name for the response
    const { data: orgData } = await admin
      .from("orgs")
      .select("name")
      .eq("id", invite.org_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        org_id: invite.org_id,
        org_name: orgData?.name || "Organization",
      }),
      {
        status: 200,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Redeem invite error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});
