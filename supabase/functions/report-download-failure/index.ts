import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReportPayload {
  failure_stage?: string;
  error_message?: string;
  http_status?: number | null;
  download_url?: string;
  surface?: string;
  org_id?: string;
}

const VALID_STAGES = new Set([
  "fetch",
  "http_error",
  "blob",
  "browser_trigger",
  "unknown",
]);

const VALID_SURFACES = new Set(["settings", "onboarding", "unknown"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Optional auth — capture user id if a JWT is provided
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await userClient.auth.getUser();
      userId = data.user?.id ?? null;
    }

    const body = (await req.json().catch(() => ({}))) as ReportPayload;

    const failure_stage = VALID_STAGES.has(body.failure_stage ?? "")
      ? body.failure_stage!
      : "unknown";
    const surface = VALID_SURFACES.has(body.surface ?? "")
      ? body.surface!
      : "unknown";

    const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    const admin = createClient(supabaseUrl, serviceKey);

    const { error } = await admin.from("plugin_download_failures").insert({
      org_id: body.org_id ?? null,
      user_id: userId,
      failure_stage,
      error_message: body.error_message?.slice(0, 1000) ?? null,
      http_status: typeof body.http_status === "number" ? body.http_status : null,
      download_url: body.download_url?.slice(0, 500) ?? null,
      user_agent: userAgent,
      surface,
    });

    if (error) {
      console.error("Failed to insert download failure:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("report-download-failure error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
