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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token: string = body.token ?? "";
    const action: string = body.action ?? "view"; // view | section_view | download
    const sectionKey: string | null = body.section_key ?? null;

    if (!token || typeof token !== "string" || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const tokenHash = await sha256(token);

    const { data: link, error } = await supabase
      .from("data_room_links")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    const ipAddress =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = req.headers.get("user-agent");
    const referrer = req.headers.get("referer");

    const logAccess = async (success: boolean, errorMessage?: string) => {
      await supabase.from("data_room_access_log").insert({
        link_id: link?.id ?? null,
        action,
        section_key: sectionKey,
        ip_address: ipAddress,
        user_agent: userAgent,
        referrer,
        success,
        error_message: errorMessage ?? null,
      });
    };

    if (error || !link) {
      await logAccess(false, "Link not found");
      return new Response(JSON.stringify({ error: "Link not found or invalid" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (link.revoked_at) {
      await logAccess(false, "Link revoked");
      return new Response(JSON.stringify({ error: "This link has been revoked" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(link.expires_at) < new Date()) {
      await logAccess(false, "Link expired");
      return new Response(JSON.stringify({ error: "This link has expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (link.max_views && link.view_count >= link.max_views) {
      await logAccess(false, "View limit reached");
      return new Response(JSON.stringify({ error: "View limit reached for this link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sectionKey && !link.allowed_sections.includes(sectionKey)) {
      await logAccess(false, "Section not allowed");
      return new Response(JSON.stringify({ error: "Section not accessible with this link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment view count only on initial 'view' action
    if (action === "view") {
      await supabase
        .from("data_room_links")
        .update({ view_count: link.view_count + 1 })
        .eq("id", link.id);
    }

    await logAccess(true);

    // Fetch sanitized acquisition data for allowed sections
    const dataPayload: Record<string, unknown> = {};

    if (link.allowed_sections.includes("executive_summary") || link.allowed_sections.includes("revenue_quality")) {
      const { data: snapshots } = await supabase
        .from("acquisition_metric_snapshots")
        .select("metric_key, metric_name, metric_value, metric_date")
        .order("metric_date", { ascending: false })
        .limit(200);
      dataPayload.snapshots = snapshots ?? [];
    }

    if (link.allowed_sections.includes("customer_concentration")) {
      const { data: contracts } = await supabase
        .from("customer_contracts")
        .select("customer_name, plan, mrr, acv, industry, geography, contract_start, contract_end")
        .order("mrr", { ascending: false })
        .limit(50);
      dataPayload.top_customers = contracts ?? [];
    }

    if (link.allowed_sections.includes("risk_flags")) {
      const { data: risks } = await supabase
        .from("acquisition_risk_flags")
        .select("title, risk_type, severity, status, description, due_date, created_at")
        .neq("status", "resolved")
        .order("created_at", { ascending: false })
        .limit(50);
      dataPayload.risks = risks ?? [];
    }

    if (link.allowed_sections.includes("financial_efficiency")) {
      const { data: finance } = await supabase
        .from("finance_monthly")
        .select("month, revenue, cogs_ai, cogs_hosting, cogs_support, cogs_other, opex_rd, opex_sm, opex_ga, cash_balance, headcount")
        .order("month", { ascending: false })
        .limit(24);
      dataPayload.finance = finance ?? [];
    }

    return new Response(
      JSON.stringify({
        ok: true,
        link: {
          label: link.label,
          recipient_name: link.recipient_name,
          recipient_company: link.recipient_company,
          watermark_text: link.watermark_text,
          allowed_sections: link.allowed_sections,
          expires_at: link.expires_at,
          views_remaining: link.max_views ? link.max_views - link.view_count - 1 : null,
        },
        data: dataPayload,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("data-room-access error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
