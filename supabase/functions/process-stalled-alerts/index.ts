// Sends a one-shot customer email when a site has been stalled for >= 15 min.
// Runs every 5 minutes via cron. Idempotent — uses
// `tracking_interruptions.customer_email_sent_at` as a flag.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALLED_EMAIL_THRESHOLD_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - STALLED_EMAIL_THRESHOLD_MINUTES * 60_000).toISOString();

    // Find open interruptions older than 15 min where we haven't emailed yet
    const { data: interruptions } = await supabase
      .from("tracking_interruptions")
      .select("id, org_id, site_id, started_at, sites!inner(domain)")
      .eq("resolved", false)
      .is("customer_email_sent_at", null)
      .lte("started_at", cutoff);

    if (!interruptions || interruptions.length === 0) {
      return new Response(JSON.stringify({ status: "ok", sent: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;

    for (const i of interruptions as any[]) {
      // Find org admin email(s)
      const { data: members } = await supabase
        .from("org_users")
        .select("user_id")
        .eq("org_id", i.org_id)
        .eq("role", "admin");

      if (!members || members.length === 0) continue;

      const userIds = members.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email, full_name")
        .in("user_id", userIds);

      const recipients = (profiles || []).filter((p: any) => !!p.email);
      if (recipients.length === 0) continue;

      const domain = i.sites?.domain || "your site";
      const recipient = recipients[0]; // primary admin

      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "tracking-stalled",
            recipientEmail: recipient.email,
            idempotencyKey: `tracking-stalled-${i.id}`,
            templateData: {
              name: recipient.full_name || null,
              domain,
              startedAt: i.started_at,
            },
          },
        });

        await supabase
          .from("tracking_interruptions")
          .update({
            customer_email_sent_at: new Date().toISOString(),
            customer_email_recipient: recipient.email,
          })
          .eq("id", i.id);
        sent++;
      } catch (err) {
        console.error(`Failed to send stalled email for interruption ${i.id}:`, err);
        failed++;
      }
    }

    return new Response(JSON.stringify({ status: "ok", sent, failed }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-stalled-alerts error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
