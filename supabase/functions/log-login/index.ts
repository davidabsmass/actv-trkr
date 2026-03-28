import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      // Stale/invalid token — silently succeed since this is fire-and-forget
      console.warn("log-login: invalid token, skipping", claimsError?.message);
      return new Response(JSON.stringify({ status: "skipped" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = data.claims.sub as string;
    const email = data.claims.email as string | undefined;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user's org
    const { data: orgUser } = await supabase
      .from("org_users")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    // Get full name from user metadata
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);

    const userAgent = req.headers.get("user-agent") || null;
    const xff = req.headers.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0].trim() : req.headers.get("x-real-ip") || null;

    // Check if this is the user's first login
    const { count: loginCount } = await supabase
      .from("login_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    await supabase.from("login_events").insert({
      user_id: userId,
      email: email || null,
      full_name: user?.user_metadata?.full_name || null,
      org_id: orgUser?.org_id || null,
      ip_address: ip,
      user_agent: userAgent,
    });

    // Send welcome email on first login
    if (loginCount === 0 && email) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: email,
            idempotencyKey: `welcome-${userId}`,
            templateData: { name: user?.user_metadata?.full_name || undefined },
          },
        });
      } catch (welcomeErr) {
        console.warn("log-login: welcome email failed (non-fatal)", welcomeErr);
      }
    }

    return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("log-login error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
