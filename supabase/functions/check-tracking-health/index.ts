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

    // Get all tracking statuses (include verifier columns so we can suppress
    // false-positive stalled alerts when the verifier confirms the tracker
    // is still installed on the site)
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
      const lastSignal = sts.last_heartbeat_at; // DB column kept as last_heartbeat_at
      const currentStatus = sts.tracker_status;
      const siteId = sts.site_id;
      const orgId = sts.org_id;
      const domain = (sts as any).sites?.domain || "unknown";
      const verifierStatus = (sts as any).verifier_last_status || null;
      const verifierCheckedAt = (sts as any).verifier_last_checked_at || null;
      // Trust the verifier signal only if it's reasonably fresh (≤ 2 hours).
      const verifierFresh = verifierCheckedAt
        ? new Date(verifierCheckedAt).getTime() > now.getTime() - 2 * 60 * 60_000
        : false;
      const trackerConfirmedPresent = verifierFresh && verifierStatus === "ok";

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

      const hasRecentEvent = Boolean(lastEvent && lastEvent >= stalledCutoff);
      const hasRecentSignal = Boolean(lastSignal && lastSignal >= stalledCutoff);

      let newStatus = "active";

      // Treat fresh heartbeat traffic as proof that tracking is alive, even on
      // quiet sites with no recent pageviews. Only mark stalled when both the
      // event stream and the signal stream are stale and the verifier has not
      // recently confirmed the tracker is present.
      if (!hasRecentEvent && !hasRecentSignal && !trackerConfirmedPresent) {
        newStatus = "stalled";
      } else if (hasRecentEvent && lastSignal && lastSignal < degradedCutoff) {
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
              details: { last_event_at: lastEvent, last_heartbeat_at: lastSignal },
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
            .eq("alert_type", "signal_stale")
            .gte("created_at", alertCooloff)
            .maybeSingle();

          if (!recentAlert) {
            await supabase.from("tracker_alerts").insert({
              org_id: orgId,
              site_id: siteId,
              alert_type: "signal_stale",
              severity: "warning",
              message: `Signal is stale for ${domain}. Events are still flowing but signal hasn't been received in ${DEGRADED_THRESHOLD_MINUTES} minutes.`,
              details: { last_heartbeat_at: lastSignal, last_event_at: lastEvent },
            });
            alertsCreated++;
          }
        }

        // Transition: stalled/degraded → active: close interruptions, create recovery alert.
        // Also auto-resolve any lingering open interruptions whenever the site
        // is currently healthy (defensive cleanup for the historical backlog).
        const becameActive = newStatus === "active" && (currentStatus === "stalled" || currentStatus === "degraded");
        if (becameActive || newStatus === "active") {
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

          if (becameActive) {
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
