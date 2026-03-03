import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retention days by plan tier
const RETENTION: Record<string, { traffic: number; forms: number }> = {
  free: { traffic: 30, forms: 90 },
  core: { traffic: 365, forms: 365 },
  performance: { traffic: 365, forms: 365 },
  growth: { traffic: 730, forms: 730 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sites } = await supabase.from("sites").select("id, org_id, plan_tier");
    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", cleaned: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalCleaned = 0;

    for (const site of sites) {
      const tier = site.plan_tier || "core";
      const retention = RETENTION[tier] || RETENTION.core;
      const now = new Date();

      // Clean old heartbeats (keep 30 days for all tiers)
      const heartbeatCutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
      await supabase.from("site_heartbeats").delete().eq("site_id", site.id).lt("received_at", heartbeatCutoff);

      // Clean old form submission logs
      const formCutoff = new Date(now.getTime() - retention.forms * 86400000).toISOString();
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
