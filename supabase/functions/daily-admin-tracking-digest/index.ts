// Daily 8am admin digest — lists every site stalled >1 hour across all orgs.
// Sent to system admin(s). Idempotent per (digest_date, recipient).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAILS = ["david@newuniformdesign.com", "david@absmass.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Find every open interruption older than 1h
    const { data: interruptions } = await supabase
      .from("tracking_interruptions")
      .select("id, org_id, site_id, started_at, customer_email_sent_at, sites!inner(domain), orgs!inner(name)")
      .eq("resolved", false)
      .lte("started_at", oneHourAgo)
      .order("started_at", { ascending: true });

    const stalledSites = (interruptions || []).map((i: any) => {
      const minutes = Math.round((Date.now() - new Date(i.started_at).getTime()) / 60_000);
      return {
        domain: i.sites?.domain,
        org_name: i.orgs?.name,
        stalled_minutes: minutes,
        stalled_for: minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`,
        customer_emailed: !!i.customer_email_sent_at,
      };
    });

    let sent = 0;
    for (const adminEmail of ADMIN_EMAILS) {
      // Skip if already sent today
      const { data: existing } = await supabase
        .from("admin_digest_log")
        .select("id")
        .eq("digest_type", "tracking_stalled_daily")
        .eq("digest_date", today)
        .eq("recipient_email", adminEmail)
        .maybeSingle();
      if (existing) continue;

      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "admin-tracking-digest",
            recipientEmail: adminEmail,
            idempotencyKey: `admin-tracking-digest-${today}-${adminEmail}`,
            templateData: {
              date: today,
              stalledCount: stalledSites.length,
              stalledSites,
            },
          },
        });

        await supabase.from("admin_digest_log").insert({
          digest_type: "tracking_stalled_daily",
          digest_date: today,
          recipient_email: adminEmail,
          payload: { stalledCount: stalledSites.length, stalledSites },
        });
        sent++;
      } catch (err) {
        console.error(`Failed admin digest to ${adminEmail}:`, err);
      }
    }

    return new Response(JSON.stringify({ status: "ok", sent, stalled_count: stalledSites.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("daily-admin-tracking-digest error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
