import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { org_id, site_id } = await req.json();
    if (!org_id || !site_id) {
      return new Response(JSON.stringify({ error: "org_id and site_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is admin or member of the org
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: membership } = await admin
      .from("org_users")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || !["admin", "member"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find all Avada forms for this site
    const { data: avadaForms, error: formsErr } = await admin
      .from("forms")
      .select("id")
      .eq("org_id", org_id)
      .eq("site_id", site_id)
      .eq("provider", "avada");

    if (formsErr) throw formsErr;
    if (!avadaForms || avadaForms.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, deleted: 0, message: "No Avada forms found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formIds = avadaForms.map((f) => f.id);
    let totalDeleted = 0;

    // 1. Get all lead IDs for these forms
    const { data: leads } = await admin
      .from("leads")
      .select("id")
      .eq("org_id", org_id)
      .in("form_id", formIds);

    const leadIds = (leads || []).map((l) => l.id);

    // 2. Delete lead_fields_flat in batches
    if (leadIds.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < leadIds.length; i += batchSize) {
        const batch = leadIds.slice(i, i + batchSize);
        await admin.from("lead_fields_flat").delete().eq("org_id", org_id).in("lead_id", batch);
      }
    }

    // 3. Delete lead_events_raw for these forms
    for (const formId of formIds) {
      await admin.from("lead_events_raw").delete().eq("org_id", org_id).eq("form_id", formId);
    }

    // 4. Delete leads for these forms
    for (const formId of formIds) {
      const { count } = await admin
        .from("leads")
        .delete({ count: "exact" })
        .eq("org_id", org_id)
        .eq("form_id", formId);
      totalDeleted += count || 0;
    }

    console.log(`[reset-avada-entries] Deleted ${totalDeleted} leads across ${formIds.length} Avada forms for org=${org_id} site=${site_id}`);

    return new Response(
      JSON.stringify({ ok: true, deleted: totalDeleted, forms_affected: formIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[reset-avada-entries] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
