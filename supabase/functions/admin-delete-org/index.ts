import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "david@newuniformdesign.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const email = userData.user.email?.toLowerCase();
    if (email !== OWNER_EMAIL) {
      return json({ error: "Forbidden — owner only" }, 403);
    }

    const { orgId } = await req.json();
    if (!orgId) return json({ error: "Missing orgId" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify org exists
    const { data: org, error: orgErr } = await admin
      .from("orgs")
      .select("id, name")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) return json({ error: "Organization not found" }, 404);

    // Delete in dependency order. Many tables cascade via FK, but we explicitly
    // delete from tables that may not cascade.
    const tables = [
      "pageviews", "sessions", "events", "leads", "lead_events_raw", "lead_fields_flat",
      "form_entries", "form_health_checks", "form_submission_logs", "form_import_jobs",
      "field_mappings", "form_integrations", "forms",
      "goal_completions", "conversion_goals", "goals_config", "goals",
      "broken_links", "incidents", "monitoring_alerts", "domain_health",
      "alerts", "ingestion_anomalies", "kpi_daily", "monthly_aggregates",
      "conversions_daily", "ad_spend",
      "archive_manifest", "export_jobs",
      "ai_usage_log", "dashboard_snapshots",
      "consent_config", "customer_profiles",
      "api_keys", "invite_codes", "feedback",
      "sites",
      "org_users",
    ];

    for (const t of tables) {
      const { error } = await admin.from(t).delete().eq("org_id", orgId);
      if (error) console.warn(`[admin-delete-org] ${t}: ${error.message}`);
    }

    // Finally delete the org itself
    const { error: delErr } = await admin.from("orgs").delete().eq("id", orgId);
    if (delErr) throw delErr;

    // Audit
    await admin.from("deletion_audit").insert({
      org_id: orgId,
      action: "admin_delete_org",
      details: { deleted_by: email, org_name: org.name },
    });

    return json({ ok: true, deleted: org.name });
  } catch (e: any) {
    console.error("[admin-delete-org] error", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
