import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      label,
      recipient_name,
      recipient_email,
      recipient_company,
      watermark_text,
      allowed_sections,
      expires_in_days = 14,
      max_views,
      notes,
    } = body;

    if (!label || typeof label !== "string") {
      return new Response(JSON.stringify({ error: "Label is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = generateToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + expires_in_days * 86400 * 1000).toISOString();

    const { data: link, error: insertErr } = await supabase
      .from("data_room_links")
      .insert({
        token_hash: tokenHash,
        label,
        recipient_name: recipient_name || null,
        recipient_email: recipient_email || null,
        recipient_company: recipient_company || null,
        watermark_text: watermark_text || recipient_company || recipient_name || null,
        allowed_sections: Array.isArray(allowed_sections) && allowed_sections.length > 0
          ? allowed_sections
          : ["executive_summary", "revenue_quality", "retention", "financial_efficiency", "customer_concentration", "risk_flags"],
        expires_at: expiresAt,
        max_views: max_views || null,
        notes: notes || null,
        created_by_user_id: userData.user.id,
      })
      .select()
      .single();

    if (insertErr) {
      throw insertErr;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        link_id: link.id,
        token, // returned ONCE — never stored in plaintext
        expires_at: expiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-data-room-link error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
