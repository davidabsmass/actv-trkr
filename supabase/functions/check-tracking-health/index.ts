import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Stalled detection thresholds ────────────────────────────────────────────
// The WP plugin signals every 5 minutes via WP-Cron. A single missed cycle
// is normal (cron drift, slow PHP, momentary network blip), so we use a
// generous window plus a two-strike rule plus an active homepage probe
// before ever raising a "tracking stopped" alert. This eliminates the
// historical false-positive pattern where low-traffic sites would alert
// purely from a quiet 10-minute window.
const DEGRADED_THRESHOLD_MINUTES = 15;       // signal stale but events flowing
const STALLED_THRESHOLD_MINUTES = 30;        // candidate for stalled status
const STALLED_STRIKES_REQUIRED = 2;          // consecutive silent cron cycles before alerting
const ALERT_COOLDOWN_MINUTES = 60;           // never re-alert same site within this window
const VERIFIER_FRESH_MS = 30 * 60_000;       // verifier result trusted for 30 min after probe

// ── Active probe ────────────────────────────────────────────────────────────
// Before alerting we re-fetch the homepage and look for tracker markers.
// If found, the tracker is verifiably installed → the site is just quiet,
// not broken. We suppress the alert and leave status as "active".
const PROBE_TIMEOUT_MS = 8_000;
const TRACKER_MARKERS = ["actv-trkr", "mission-metrics", "tracker.js", "x-actvtrkr-key"];

async function activeProbeForTracker(url: string): Promise<{
  reachable: boolean;
  trackerFound: boolean;
  httpStatus: number | null;
  error: string | null;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "ACTV-TRKR-HealthProbe/1.0" },
    });
    if (!res.ok) {
      return { reachable: false, trackerFound: false, httpStatus: res.status, error: `HTTP ${res.status}` };
    }
    const html = (await res.text()).toLowerCase();
    const trackerFound = TRACKER_MARKERS.some((m) => html.includes(m));
    return { reachable: true, trackerFound, httpStatus: res.status, error: null };
  } catch (err) {
    return {
      reachable: false,
      trackerFound: false,
      httpStatus: null,
      error: (err as Error).message?.slice(0, 200) || "probe_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const degradedCutoff = new Date(now.getTime() - DEGRADED_THRESHOLD_MINUTES * 60000).toISOString();
    const stalledCutoff = new Date(now.getTime() - STALLED_THRESHOLD_MINUTES * 60000).toISOString();
    const alertCooloff = new Date(now.getTime() - ALERT_COOLDOWN_MINUTES * 60000).toISOString();

    const { data: statuses } = await supabase
      .from("site_tracking_status")
      .select("*, sites!inner(domain, url, org_id)")
      .not("last_event_at", "is", null);

    if (!statuses || statuses.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let alertsCreated = 0;
    let alertsSuppressed = 0;
    let interruptionsOpened = 0;
    let interruptionsClosed = 0;
    let statusUpdates = 0;
    let activeProbes = 0;

    for (const sts of statuses) {
      const lastEvent = sts.last_event_at;
      const lastSignal = sts.last_heartbeat_at;
      const currentStatus = sts.tracker_status;
      const siteId = sts.site_id;
      const orgId = sts.org_id;
      const domain = (sts as any).sites?.domain || "unknown";
      const siteUrl = (sts as any).sites?.url || `https://${domain}`;
      const verifierStatus = (sts as any).verifier_last_status || null;
      const verifierCheckedAt = (sts as any).verifier_last_checked_at || null;
      const consecutiveSilent: number = (sts as any).consecutive_silent_checks ?? 0;

      const verifierFresh = verifierCheckedAt
        ? new Date(verifierCheckedAt).getTime() > now.getTime() - VERIFIER_FRESH_MS
        : false;
      const trackerConfirmedPresent = verifierFresh && verifierStatus === "ok";

      // Hourly event count (used for UI badge, also helpful for diagnosing alerts)
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

      // ── Compute candidate status ────────────────────────────────────────
      let newStatus = "active";
      let nextSilentStrikes = 0;
      let probeResult: Awaited<ReturnType<typeof activeProbeForTracker>> | null = null;
      let suppressedReason: string | null = null;

      if (!hasRecentEvent && !hasRecentSignal && !trackerConfirmedPresent) {
        // Candidate for stalled. Increment strike counter; only act once we
        // have STALLED_STRIKES_REQUIRED in a row.
        nextSilentStrikes = consecutiveSilent + 1;

        if (nextSilentStrikes >= STALLED_STRIKES_REQUIRED) {
          // Two strikes — actively probe the site before deciding.
          activeProbes++;
          probeResult = await activeProbeForTracker(siteUrl);

          if (probeResult.reachable && probeResult.trackerFound) {
            // Tracker is verifiably installed → site is just quiet, not broken.
            // Persist the verifier result so we don't re-probe next cycle.
            newStatus = "active";
            suppressedReason = "tracker_present_no_traffic";
            await supabase
              .from("site_tracking_status")
              .update({
                verifier_last_checked_at: now.toISOString(),
                verifier_last_status: "ok",
                verifier_last_message: "Active probe confirmed tracker installed (no recent traffic)",
              })
              .eq("id", sts.id);
            alertsSuppressed++;
            // Reset strikes — we have positive proof tracking is alive.
            nextSilentStrikes = 0;
          } else {
            // Tracker missing OR site unreachable → genuinely broken.
            newStatus = "stalled";
          }
        } else {
          // First strike — wait one more cycle before alerting.
          newStatus = currentStatus === "stalled" ? "stalled" : "active";
        }
      } else if (hasRecentEvent && lastSignal && lastSignal < degradedCutoff) {
        newStatus = "degraded";
      }

      // ── Persist status + counters ───────────────────────────────────────
      const updatePayload: Record<string, unknown> = {
        events_last_hour: eventsLastHour,
        consecutive_silent_checks: nextSilentStrikes,
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

      // ── Transition: → stalled (open interruption + alert) ───────────────
      if (newStatus === "stalled" && currentStatus !== "stalled") {
        await supabase.from("tracking_interruptions").insert({
          org_id: orgId,
          site_id: siteId,
          started_at: lastEvent || now.toISOString(),
          trigger_reason: probeResult?.reachable === false
            ? "site_unreachable"
            : probeResult?.trackerFound === false
            ? "tracker_missing"
            : "stalled_no_events",
        });
        interruptionsOpened++;

        // Cooldown check
        const { data: recentAlert } = await supabase
          .from("tracker_alerts")
          .select("id")
          .eq("site_id", siteId)
          .eq("alert_type", "tracking_stalled")
          .gte("created_at", alertCooloff)
          .maybeSingle();

        if (!recentAlert) {
          // Build a precise, actionable message based on what the probe found.
          let message: string;
          let severity = "error";
          if (probeResult && !probeResult.reachable) {
            message = `Site ${domain} is unreachable (${probeResult.error || "no response"}). Tracking cannot resume until the site is back online.`;
          } else if (probeResult && !probeResult.trackerFound) {
            message = `Tracker script not found on ${domain}. The ACTV TRKR plugin may be deactivated, or a caching/CSP rule may be stripping the script.`;
          } else {
            message = `Tracking signal stopped for ${domain}. Plugin heartbeat hasn't been received for ${STALLED_THRESHOLD_MINUTES}+ minutes.`;
            severity = "warning";
          }

          await supabase.from("tracker_alerts").insert({
            org_id: orgId,
            site_id: siteId,
            alert_type: "tracking_stalled",
            severity,
            message,
            details: {
              last_event_at: lastEvent,
              last_heartbeat_at: lastSignal,
              probe: probeResult,
              consecutive_silent_checks: nextSilentStrikes,
            },
          });
          alertsCreated++;
        }
      }

      // ── Transition: degraded warning ────────────────────────────────────
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
            message: `Plugin signal is stale for ${domain}. Events are still flowing but heartbeat hasn't been received in ${DEGRADED_THRESHOLD_MINUTES}+ minutes.`,
            details: { last_heartbeat_at: lastSignal, last_event_at: lastEvent },
          });
          alertsCreated++;
        }
      }

      // ── Transition: → active (close interruptions, recovery alert) ──────
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

      if (suppressedReason) {
        console.log(`[health] ${domain}: alert suppressed (${suppressedReason})`);
      }
    }

    return new Response(JSON.stringify({
      status: "ok",
      checked: statuses.length,
      status_updates: statusUpdates,
      alerts_created: alertsCreated,
      alerts_suppressed: alertsSuppressed,
      active_probes: activeProbes,
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
