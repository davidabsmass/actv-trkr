import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch all sites that have had at least one heartbeat
    const { data: sites } = await supabase
      .from("sites")
      .select("id, org_id, domain, status, last_heartbeat_at, down_after_minutes")
      .not("last_heartbeat_at", "is", null);

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    let downCount = 0;

    for (const site of sites) {
      const lastBeat = new Date(site.last_heartbeat_at);
      const minutesSince = (now.getTime() - lastBeat.getTime()) / 60000;
      const threshold = site.down_after_minutes || 15;

      if (minutesSince > threshold && site.status !== "DOWN") {
        // Mark site as DOWN
        await supabase.from("sites").update({ status: "DOWN" }).eq("id", site.id);

        // Create DOWNTIME incident
        const { data: incident } = await supabase.from("incidents").insert({
          site_id: site.id,
          org_id: site.org_id,
          type: "DOWNTIME",
          severity: "critical",
          details: { domain: site.domain, minutes_since_heartbeat: Math.round(minutesSince) },
        }).select("id").single();

        // Queue alert
        if (incident) {
          await supabase.from("monitoring_alerts").insert({
            site_id: site.id,
            org_id: site.org_id,
            incident_id: incident.id,
            alert_type: "DOWNTIME",
            severity: "critical",
            subject: `Site DOWN: ${site.domain}`,
            message: `No check-in received from ${site.domain} for ${Math.round(minutesSince)} minutes. The site may be unreachable.`,
          });
        }

        downCount++;
      }
    }

    return new Response(JSON.stringify({ status: "ok", checked: sites.length, newly_down: downCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Uptime check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
