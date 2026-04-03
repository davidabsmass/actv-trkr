import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const { id } = await req.json();

    if (!id || typeof id !== "string") {
      return new Response(
        JSON.stringify({ error: "Snapshot ID required" }),
        { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return new Response(
        JSON.stringify({ error: "Invalid snapshot ID" }),
        { status: 400, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await admin
      .from("dashboard_snapshots")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Snapshot not found" }),
        { status: 404, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Check expiry server-side
    if (new Date(data.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Snapshot expired", expires_at: data.expires_at }),
        { status: 410, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ snapshot: data }),
      { status: 200, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-snapshot error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
