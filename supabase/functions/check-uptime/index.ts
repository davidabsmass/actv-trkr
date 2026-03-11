import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function httpPing(domain: string): Promise<{ reachable: boolean; statusCode: number | null; latencyMs: number | null }> {
  const url = `https://${domain}`;
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    return { reachable: resp.ok || resp.status < 500, statusCode: resp.status, latencyMs: Date.now() - start };
  } catch {
    // Try GET as fallback (some servers reject HEAD)
    try {
      const resp = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      return { reachable: resp.ok || resp.status < 500, statusCode: resp.status, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false, statusCode: null, latencyMs: null };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sites } = await supabase
      .from("sites")
      .select("id, org_id, domain, status, last_heartbeat_at, down_after_minutes");

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    let downCount = 0;
    let recoveredCount = 0;

    for (const site of sites) {
      // Active HTTP ping — the primary reliability check
      const ping = await httpPing(site.domain);

      if (!ping.reachable) {
        // Also check heartbeat staleness as secondary signal
        const lastBeat = site.last_heartbeat_at ? new Date(site.last_heartbeat_at) : null;
        const minutesSince = lastBeat ? (now.getTime() - lastBeat.getTime()) / 60000 : null;

        if (site.status !== "DOWN") {
          // Mark site as DOWN
          await supabase.from("sites").update({ status: "DOWN" }).eq("id", site.id);

          // Create DOWNTIME incident
          const { data: incident } = await supabase.from("incidents").insert({
            site_id: site.id,
            org_id: site.org_id,
            type: "DOWNTIME",
            severity: "critical",
            details: {
              domain: site.domain,
              http_status: ping.statusCode,
              last_response_minutes_ago: minutesSince ? Math.round(minutesSince) : null,
            },
          }).select("id").single();

          // Queue ONE alert (no duplicates — only fires when status transitions to DOWN)
          if (incident) {
            await supabase.from("monitoring_alerts").insert({
              site_id: site.id,
              org_id: site.org_id,
              incident_id: incident.id,
              alert_type: "DOWNTIME",
              severity: "critical",
              subject: `Site DOWN: ${site.domain}`,
              message: `${site.domain} is not responding (HTTP ${ping.statusCode || "unreachable"}). We'll notify you when it recovers.`,
            });
          }

          downCount++;
        }
        // If already DOWN, do nothing — no duplicate alerts
      } else {
        // Site is reachable
        if (site.status === "DOWN") {
          // RECOVERY — site came back
          await supabase.from("sites").update({ status: "UP" }).eq("id", site.id);

          // Resolve open DOWNTIME incident
          const { data: openIncident } = await supabase
            .from("incidents")
            .select("id, started_at")
            .eq("site_id", site.id)
            .eq("type", "DOWNTIME")
            .is("resolved_at", null)
            .maybeSingle();

          if (openIncident) {
            await supabase.from("incidents").update({ resolved_at: now.toISOString() }).eq("id", openIncident.id);

            const downtimeMinutes = Math.round((now.getTime() - new Date(openIncident.started_at).getTime()) / 60000);

            // Send RECOVERY notification
            await supabase.from("monitoring_alerts").insert({
              site_id: site.id,
              org_id: site.org_id,
              incident_id: openIncident.id,
              alert_type: "DOWNTIME",
              severity: "info",
              subject: `Site RECOVERED: ${site.domain}`,
              message: `${site.domain} is back online after ${downtimeMinutes} minute${downtimeMinutes === 1 ? "" : "s"} of downtime.`,
            });
          }

          recoveredCount++;
        }
      }
    }

    return new Response(JSON.stringify({ status: "ok", checked: sites.length, newly_down: downCount, recovered: recoveredCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Uptime check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
