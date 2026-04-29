// Public-ish status endpoint polled by the WordPress plugin admin banner.
// Authenticated by site API key. Returns whether tracking is currently
// stalled and a short human-readable reason.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-actvtrkr-key",
};

const SIGNAL_FRESH_MINUTES = 10;
const VERIFIER_FRESH_MINUTES = 30;

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const rawDomain = (url.searchParams.get("domain") || "").trim();
    const apiKey = (req.headers.get("x-actvtrkr-key") || "").trim();
    if (!apiKey || !rawDomain) {
      return new Response(JSON.stringify({ error: "Missing domain or API key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const domain = rawDomain.replace(/^www\./i, "").toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const keyHash = await hashKey(apiKey);
    const { data: ak } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (!ak) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: site } = await supabase
      .from("sites")
      .select("id, last_heartbeat_at")
      .eq("org_id", ak.org_id)
      .eq("domain", domain)
      .maybeSingle();
    if (!site) {
      return new Response(JSON.stringify({ status: "unknown", message: "Site not registered" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sts } = await supabase
      .from("site_tracking_status")
      .select("tracker_status, last_event_at, last_heartbeat_at, verifier_last_status, verifier_last_message")
      .eq("site_id", site.id)
      .maybeSingle();

    const freshestHeartbeatAt = sts?.last_heartbeat_at || site.last_heartbeat_at || null;
    const signalIsFresh = freshestHeartbeatAt
      ? new Date(freshestHeartbeatAt).getTime() > Date.now() - SIGNAL_FRESH_MINUTES * 60_000
      : false;
    const trackerStatus = signalIsFresh && sts?.verifier_last_status !== "tracker_missing" && sts?.verifier_last_status !== "unreachable"
      ? "active"
      : (sts?.tracker_status || "active");
    const verifierStatus = sts?.verifier_last_status || null;
    const verifierCheckedAt = sts?.verifier_last_checked_at || null;
    const verifierIsFresh = verifierCheckedAt
      ? new Date(verifierCheckedAt).getTime() > Date.now() - VERIFIER_FRESH_MINUTES * 60_000
      : false;

    // Banner trigger logic — STALLED only (or verifier-confirmed missing)
    const showBanner = !signalIsFresh && (
      trackerStatus === "stalled" ||
      (verifierIsFresh && (verifierStatus === "tracker_missing" || verifierStatus === "unreachable"))
    );

    let message = "Tracking is healthy.";
    if (signalIsFresh) {
      message = "Tracking signal is healthy.";
    } else if (trackerStatus === "stalled") {
      message = "No tracking events received from this site for over 10 minutes.";
    } else if (verifierIsFresh && verifierStatus === "tracker_missing") {
      message = "Our hourly homepage check could not find the ACTV TRKR script.";
    } else if (verifierIsFresh && verifierStatus === "unreachable") {
      message = sts?.verifier_last_message || "Site unreachable from our verifier.";
    }

    return new Response(
      JSON.stringify({
        status: showBanner ? "stalled" : "ok",
        tracker_status: trackerStatus,
        verifier_status: verifierStatus,
        last_event_at: sts?.last_event_at || null,
        last_heartbeat_at: freshestHeartbeatAt,
        message,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("check-site-status error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
