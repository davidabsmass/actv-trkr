import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retention days by plan tier (baseline defaults)
const RETENTION: Record<string, { traffic: number; forms: number }> = {
  free: { traffic: 30, forms: 90 },
  core: { traffic: 365, forms: 365 },
  performance: { traffic: 365, forms: 365 },
  growth: { traffic: 730, forms: 730 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sites } = await supabase.from("sites").select("id, org_id, plan_tier");
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", cleaned: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load consent_config overrides (retention_months per org)
    const orgIds = [...new Set(sites.map((s: any) => s.org_id))];
    const { data: consentConfigs } = await supabase
      .from("consent_config")
      .select("org_id, retention_months")
      .in("org_id", orgIds);

    const orgRetentionOverride: Record<string, number> = {};
    if (consentConfigs) {
      for (const cc of consentConfigs) {
        if (cc.retention_months && cc.retention_months > 0) {
          orgRetentionOverride[cc.org_id] = cc.retention_months * 30; // convert months to days
        }
      }
    }

    let totalCleaned = 0;

    for (const site of sites) {
      const tier = site.plan_tier || "core";
      const planRetention = RETENTION[tier] || RETENTION.core;

      // If org has a consent_config.retention_months override, use the stricter value
      // (i.e. the shorter retention period wins for GDPR compliance)
      const overrideDays = orgRetentionOverride[site.org_id];
      const traffic = overrideDays ? Math.min(planRetention.traffic, overrideDays) : planRetention.traffic;
      const forms = overrideDays ? Math.min(planRetention.forms, overrideDays) : planRetention.forms;

      const now = new Date();

      // Clean old heartbeats (keep 30 days for all tiers)
      const heartbeatCutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
      await supabase.from("site_heartbeats").delete().eq("site_id", site.id).lt("received_at", heartbeatCutoff);

      // Clean old form submission logs
      const formCutoff = new Date(now.getTime() - forms * 86400000).toISOString();
      await supabase.from("form_submission_logs").delete().eq("site_id", site.id).lt("occurred_at", formCutoff);

      // Clean old broken links (not seen in 90 days)
      const brokenCutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
      await supabase.from("broken_links").delete().eq("site_id", site.id).lt("last_seen_at", brokenCutoff);

      // Clean old monitoring alerts (keep 90 days)
      const alertCutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
      await supabase.from("monitoring_alerts").delete().eq("site_id", site.id).lt("created_at", alertCutoff);

      // Clean old notification inbox (keep 90 days)
      const inboxCutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
      await supabase.from("notification_inbox").delete().eq("site_id", site.id).lt("created_at", inboxCutoff);

      // Clean old events beyond retention window
      const eventsCutoff = new Date(now.getTime() - traffic * 86400000).toISOString();
      await supabase.from("events").delete().eq("site_id", site.id).lt("occurred_at", eventsCutoff);

      totalCleaned++;
    }

    return new Response(JSON.stringify({ status: "ok", sites_cleaned: totalCleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Retention cleanup error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
