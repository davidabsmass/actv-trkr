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

    // This function is invoked by pg_cron with anon key — no additional auth needed.
    // All DB ops use service_role client above.

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

      // ── Compute events_last_hour ──
      let eventsLastHour = 0;
      try {
        const oneHourAgo = new Date(now.getTime() - 3600_000).toISOString();
        const { count } = await supabase
          .from("events")
          .select("*", { count: "exact", head: true })
          .eq("site_id", siteId)
          .eq("org_id", orgId)
          .gte("occurred_at", oneHourAgo);
        eventsLastHour = count ?? 0;
      } catch { /* non-fatal */ }

      let newStatus = "active";

      // Determine new status
      if (lastEvent && lastEvent < stalledCutoff) {
        newStatus = "stalled";
      } else if (lastHeartbeat && lastHeartbeat < degradedCutoff && lastEvent && lastEvent >= stalledCutoff) {
        newStatus = "degraded";
      }

      // Always update events_last_hour; update status only if changed
      const updatePayload: Record<string, unknown> = {
        events_last_hour: eventsLastHour,
        updated_at: now.toISOString(),
      };

      if (newStatus !== currentStatus) {
        updatePayload.tracker_status = newStatus;
        statusUpdates++;
      }

      await supabase
        .from("site_tracking_status")
        .update(updatePayload)
        .eq("id", sts.id);

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
