import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRM_THRESHOLD = 2; // Must fail this many consecutive checks before marking DOWN

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

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sites } = await supabase
      .from("sites")
      .select("id, org_id, domain, status, fail_count");

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    let downCount = 0;
    let recoveredCount = 0;

    for (const site of sites) {
      const ping = await httpPing(site.domain);
      const currentFailCount = site.fail_count || 0;

      if (!ping.reachable) {
        const newFailCount = currentFailCount + 1;

        if (newFailCount >= CONFIRM_THRESHOLD && site.status !== "DOWN") {
          // Confirmed down after multiple consecutive failures — mark DOWN and alert
          await supabase.from("sites").update({ status: "DOWN", fail_count: newFailCount }).eq("id", site.id);

          const { data: incident } = await supabase.from("incidents").insert({
            site_id: site.id,
            org_id: site.org_id,
            type: "DOWNTIME",
            severity: "critical",
            details: {
              domain: site.domain,
              http_status: ping.statusCode,
              consecutive_failures: newFailCount,
            },
          }).select("id").single();

          if (incident) {
            await supabase.from("monitoring_alerts").insert({
              site_id: site.id,
              org_id: site.org_id,
              incident_id: incident.id,
              alert_type: "DOWNTIME",
              severity: "critical",
              subject: `Site DOWN: ${site.domain}`,
              message: `${site.domain} is not responding after ${newFailCount} consecutive checks (HTTP ${ping.statusCode || "unreachable"}). We'll notify you when it recovers.`,
            });
          }

          downCount++;
        } else if (site.status !== "DOWN") {
          // First failure — increment counter but don't alert yet
          await supabase.from("sites").update({ fail_count: newFailCount }).eq("id", site.id);
        }
        // If already DOWN, just bump fail_count
        if (site.status === "DOWN") {
          await supabase.from("sites").update({ fail_count: newFailCount }).eq("id", site.id);
        }
      } else {
        // Site is reachable — reset fail counter
        if (site.status === "DOWN") {
          // RECOVERY
          await supabase.from("sites").update({ status: "UP", fail_count: 0 }).eq("id", site.id);

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
        } else if (currentFailCount > 0) {
          // Was failing but recovered before threshold — just reset counter
          await supabase.from("sites").update({ fail_count: 0 }).eq("id", site.id);
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
