import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Accept either x-cron-secret header or a valid JWT (from pg_cron via anon key)
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const hasCronSecret = cronSecret && incoming === cronSecret;
  const hasValidAuth = authHeader?.startsWith("Bearer ");
  
  if (!hasCronSecret && !hasValidAuth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch queued alerts
    const { data: alerts } = await supabase
      .from("monitoring_alerts")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(50);

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ status: "ok", processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processed = 0;

    for (const alert of alerts) {
      try {
        // Get site notification rules for this alert type
        const { data: rules } = await supabase
          .from("site_notification_rules")
          .select("channel, is_enabled")
          .eq("site_id", alert.site_id)
          .eq("alert_type", alert.alert_type);

        // Get org members for this site's org
        const { data: members } = await supabase
          .from("org_users")
          .select("user_id")
          .eq("org_id", alert.org_id);

        if (!members || members.length === 0) {
          await supabase.from("monitoring_alerts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", alert.id);
          processed++;
          continue;
        }

        for (const member of members) {
          // Check user subscription for this site + alert type
          const { data: subs } = await supabase
            .from("user_site_subscriptions")
            .select("channel, is_enabled")
            .eq("user_id", member.user_id)
            .eq("site_id", alert.site_id)
            .eq("alert_type", alert.alert_type);

          // Check user notification preferences
          const { data: userPrefs } = await supabase
            .from("user_notification_preferences")
            .select("channel, is_enabled")
            .eq("user_id", member.user_id);

          const userPrefMap = new Map((userPrefs || []).map(p => [p.channel, p.is_enabled]));
          const subMap = new Map((subs || []).map(s => [s.channel, s.is_enabled]));
          const ruleMap = new Map((rules || []).map(r => [r.channel, r.is_enabled]));

          // Determine which channels to send to
          const channels = ["in_app", "email"];

          for (const channel of channels) {
            // Rule must be enabled (default: in_app is always on)
            const ruleEnabled = ruleMap.get(channel) ?? (channel === "in_app");
            // User subscription must be enabled (default: true)
            const subEnabled = subMap.get(channel) ?? true;
            // User preference must be enabled (default: true for in_app and email)
            const prefEnabled = userPrefMap.get(channel) ?? (channel === "in_app" || channel === "email");

            if (!ruleEnabled || !subEnabled || !prefEnabled) continue;

            if (channel === "in_app") {
              await supabase.from("notification_inbox").insert({
                user_id: member.user_id,
                site_id: alert.site_id,
                alert_id: alert.id,
                title: alert.subject,
                body: alert.message,
              });
            } else if (channel === "email") {
              // Send via Resend if configured
              const resendApiKey = Deno.env.get("RESEND_API_KEY");
              const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "alerts@actvtrkr.com";

              if (resendApiKey) {
                // Get user email
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("email")
                  .eq("user_id", member.user_id)
                  .maybeSingle();

                if (profile?.email) {
                  try {
                    const emailResp = await fetch("https://api.resend.com/emails", {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${resendApiKey}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        from: fromEmail,
                        to: profile.email,
                        subject: alert.subject,
                        html: `<p>${alert.message}</p>`,
                      }),
                    });
                    if (!emailResp.ok) {
                      console.error("Resend error:", await emailResp.text());
                    }
                  } catch (e) {
                    console.error("Email send error:", e);
                  }
                }
              }
            }
            // SMS: architecture-ready, no provider implemented yet
          }
        }

        await supabase.from("monitoring_alerts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", alert.id);
        processed++;
      } catch (alertErr) {
        console.error("Alert processing error:", alertErr);
        await supabase.from("monitoring_alerts").update({ status: "failed", error: String(alertErr) }).eq("id", alert.id);
      }
    }

    return new Response(JSON.stringify({ status: "ok", processed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Process alerts error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
