// revoke-user-session
// Authenticated endpoint that lets the signed-in user mark one of their
// auth_recent_sessions rows as revoked, OR revoke a trusted device.
// Both are owner-scoped via JWT.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const target = String(body?.target ?? "").trim(); // 'session' | 'device' | 'all'
    const id = String(body?.id ?? "").trim();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (target === "session" && id) {
      await admin
        .from("auth_recent_sessions")
        .update({ revoked_at: new Date().toISOString(), revoke_reason: "user_revoked" })
        .eq("id", id)
        .eq("user_id", userId)
        .is("revoked_at", null);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target === "device" && id) {
      await admin
        .from("auth_trusted_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .is("revoked_at", null);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target === "all") {
      // Sign out everywhere and mark all sessions/devices revoked.
      try { await admin.auth.admin.signOut(userId, "global"); } catch { /* ignore */ }
      await admin
        .from("auth_recent_sessions")
        .update({ revoked_at: new Date().toISOString(), revoke_reason: "user_revoked_all" })
        .eq("user_id", userId)
        .is("revoked_at", null);
      await admin
        .from("auth_trusted_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("revoke-user-session unexpected", (e as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
