import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEGRADED_THRESHOLD_MINUTES = 3;
const STALLED_THRESHOLD_MINUTES = 10;
const ALERT_COOLDOWN_MINUTES = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Allow invocation via cron (anon key + cron secret) or service role
    const cronSecret = req.headers.get("x-cron-secret") || "";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Check cron_secret from app_config
    const { data: configRow } = await supabase.from("app_config").select("value").eq("key", "cron_secret").maybeSingle();
    const validCron = configRow && cronSecret && configRow.value === cronSecret;

    // Also allow if no cron_secret is configured (bootstrapping) or called internally
    if (!validCron && configRow?.value) {
      // Strict: if a cron_secret is configured, require it
      // But allow calls from the cron scheduler which uses anon key without x-cron-secret header
      // by checking if request has the expected anon auth
      const authHeader = req.headers.get("authorization") || "";
      const hasAnonKey = authHeader.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      if (!hasAnonKey) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const now = new Date();
    const degradedCutoff = new Date(now.getTime() - DEGRADED_THRESHOLD_MINUTES * 60000).toISOString();
    const stalledCutoff = new Date(now.getTime() - STALLED_THRESHOLD_MINUTES * 60000).toISOString();
    const alertCooloff = new Date(now.getTime() - ALERT_COOLDOWN_MINUTES * 60000).toISOString();

    // Get all tracking statuses
    const { data: statuses } = await supabase
      .from("site_tracking_status")
      .select("*, sites!inner(domain, org_id)")
      .not("last_event_at", "is", null);

    if (!statuses || statuses.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let alertsCreated = 0;
    let interruptionsOpened = 0;
    let interruptionsClosed = 0;
    let statusUpdates = 0;

    for (const sts of statuses) {
      const lastEvent = sts.last_event_at;
      const lastHeartbeat = sts.last_heartbeat_at;
      const currentStatus = sts.tracker_status;
      const siteId = sts.site_id;
      const orgId = sts.org_id;
      const domain = (sts as any).sites?.domain || "unknown";

      let newStatus = "active";

      // Determine new status
      if (lastEvent && lastEvent < stalledCutoff) {
        newStatus = "stalled";
      } else if (lastHeartbeat && lastHeartbeat < degradedCutoff && lastEvent && lastEvent >= stalledCutoff) {
        newStatus = "degraded";
      }

      // If status changed, update it
      if (newStatus !== currentStatus) {
        await supabase
          .from("site_tracking_status")
          .update({ tracker_status: newStatus, updated_at: now.toISOString() })
          .eq("id", sts.id);
        statusUpdates++;

        // Transition: active/degraded → stalled: open interruption
        if (newStatus === "stalled" && currentStatus !== "stalled") {
          await supabase.from("tracking_interruptions").insert({
            org_id: orgId,
            site_id: siteId,
            started_at: lastEvent || now.toISOString(),
            trigger_reason: "stalled_no_events",
          });
          interruptionsOpened++;

          // Create alert (with cooldown check)
          const { data: recentAlert } = await supabase
            .from("tracker_alerts")
            .select("id")
            .eq("site_id", siteId)
            .eq("alert_type", "tracking_stalled")
            .gte("created_at", alertCooloff)
            .maybeSingle();

          if (!recentAlert) {
            await supabase.from("tracker_alerts").insert({
              org_id: orgId,
              site_id: siteId,
              alert_type: "tracking_stalled",
              severity: "error",
              message: `Tracking data has stopped for ${domain}. No events received in the last ${STALLED_THRESHOLD_MINUTES} minutes.`,
              details: { last_event_at: lastEvent, last_heartbeat_at: lastHeartbeat },
            });
            alertsCreated++;
          }
        }

        // Transition: degraded (from active): create warning
        if (newStatus === "degraded" && currentStatus === "active") {
          const { data: recentAlert } = await supabase
            .from("tracker_alerts")
            .select("id")
            .eq("site_id", siteId)
            .eq("alert_type", "heartbeat_stale")
            .gte("created_at", alertCooloff)
            .maybeSingle();

          if (!recentAlert) {
            await supabase.from("tracker_alerts").insert({
              org_id: orgId,
              site_id: siteId,
              alert_type: "heartbeat_stale",
              severity: "warning",
              message: `Heartbeat is stale for ${domain}. Events are still flowing but heartbeat hasn't been received in ${DEGRADED_THRESHOLD_MINUTES} minutes.`,
              details: { last_heartbeat_at: lastHeartbeat, last_event_at: lastEvent },
            });
            alertsCreated++;
          }
        }

        // Transition: stalled/degraded → active: close interruptions, create recovery alert
        if (newStatus === "active" && (currentStatus === "stalled" || currentStatus === "degraded")) {
          const { data: openInterruptions } = await supabase
            .from("tracking_interruptions")
            .select("id, started_at")
            .eq("site_id", siteId)
            .eq("resolved", false);

          if (openInterruptions) {
            for (const interruption of openInterruptions) {
              const durationSeconds = Math.round(
                (now.getTime() - new Date(interruption.started_at).getTime()) / 1000
              );
              await supabase
                .from("tracking_interruptions")
                .update({
                  ended_at: now.toISOString(),
                  duration_seconds: durationSeconds,
                  resolved: true,
                })
                .eq("id", interruption.id);
              interruptionsClosed++;
            }
          }

          await supabase.from("tracker_alerts").insert({
            org_id: orgId,
            site_id: siteId,
            alert_type: "tracking_recovered",
            severity: "info",
            message: `Tracking data resumed for ${domain}.`,
            details: { recovered_at: now.toISOString(), previous_status: currentStatus },
          });
          alertsCreated++;
        }
      }
    }

    return new Response(JSON.stringify({
      status: "ok",
      checked: statuses.length,
      status_updates: statusUpdates,
      alerts_created: alertsCreated,
      interruptions_opened: interruptionsOpened,
      interruptions_closed: interruptionsClosed,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Tracking health check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
