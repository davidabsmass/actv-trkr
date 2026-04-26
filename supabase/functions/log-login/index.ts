import { createClient } from "npm:@supabase/supabase-js@2";
import { extractClientIp, hashIp } from "../_shared/ingestion-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !data?.claims) {
      console.warn("log-login: invalid token, skipping", claimsError?.message);
      return new Response(JSON.stringify({ status: "skipped" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = data.claims.sub as string;
    const email = data.claims.email as string | undefined;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: orgUser } = await supabase
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const { data: { user } } = await supabase.auth.admin.getUserById(userId);

    const userAgent = req.headers.get("user-agent") || null;
    const clientIp = extractClientIp(req);
    const ipHash = clientIp ? await hashIp(clientIp) : null;

    await supabase.from("login_events").insert({
      user_id: userId,
      email: email || null,
      full_name: user?.user_metadata?.full_name || null,
      org_id: orgUser?.org_id || null,
      ip_address: null, // Never store raw IP
      ip_hash: ipHash,
      user_agent: userAgent,
    });

    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("log-login error:", err);
    // Return 200 with fallback flag so client login flow never breaks on logging failures
    return new Response(JSON.stringify({ status: "error", fallback: true, message: (err as Error)?.message || "internal" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
