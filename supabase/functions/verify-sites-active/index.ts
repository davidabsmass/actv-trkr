// Hourly active site verifier.
// Fetches each connected site's homepage and confirms the ACTV TRKR tracker
// script is present. Distinguishes "no traffic" (healthy) from "broken"
// (plugin deactivated, cache stripping script, site down, etc.).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FETCH_TIMEOUT_MS = 10_000;
const TRACKER_MARKERS = [
  "actv-trkr",
  "mission-metrics",
  "tracker.js",
  "x-actvtrkr-key",
];

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "ACTV-TRKR-Verifier/1.0" },
    });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all connected sites
    const { data: sites } = await supabase
      .from("sites")
      .select("id, org_id, domain, url");

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    let checked = 0;
    let trackerMissing = 0;
    let unreachable = 0;
    let healthy = 0;

    for (const site of sites) {
      checked++;
      const target = site.url || `https://${site.domain}`;
      let verifierStatus = "ok";
      let verifierMessage = "Tracker detected";

      try {
        const res = await fetchWithTimeout(target);
        if (!res.ok) {
          verifierStatus = "unreachable";
          verifierMessage = `HTTP ${res.status}`;
          unreachable++;
        } else {
          const html = (await res.text()).toLowerCase();
          const found = TRACKER_MARKERS.some((m) => html.includes(m));
          if (!found) {
            verifierStatus = "tracker_missing";
            verifierMessage = "ACTV TRKR script not found in homepage HTML";
            trackerMissing++;
          } else {
            healthy++;
          }
        }
      } catch (err) {
        verifierStatus = "unreachable";
        verifierMessage = `Fetch failed: ${(err as Error).message?.slice(0, 200) || "unknown"}`;
        unreachable++;
      }

      // Upsert site_tracking_status verifier columns
      const { data: existing } = await supabase
        .from("site_tracking_status")
        .select("id")
        .eq("site_id", site.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("site_tracking_status")
          .update({
            verifier_last_checked_at: now,
            verifier_last_status: verifierStatus,
            verifier_last_message: verifierMessage,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("site_tracking_status").insert({
          org_id: site.org_id,
          site_id: site.id,
          tracker_status: "active",
          verifier_last_checked_at: now,
          verifier_last_status: verifierStatus,
          verifier_last_message: verifierMessage,
        });
      }
    }

    return new Response(
      JSON.stringify({ status: "ok", checked, healthy, tracker_missing: trackerMissing, unreachable }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-sites-active error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
