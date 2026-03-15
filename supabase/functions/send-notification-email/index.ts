import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "ACTV TRKR";
const SENDER_DOMAIN = "notify.actvtrkr.com";
const FROM_DOMAIN = "actvtrkr.com";

interface NotificationEmailRequest {
  type: "weekly_summary" | "daily_digest" | "lead_realtime" | "lead_digest";
  org_id: string;
  subject: string;
  html_body: string;
  text_body?: string;
  recipient_user_ids?: string[]; // If empty, send to all org members with pref enabled
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body: NotificationEmailRequest = await req.json();

    // Get org members
    const { data: members } = await supabase
      .from("org_users")
      .select("user_id")
      .eq("org_id", body.org_id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userIds = body.recipient_user_ids?.length
      ? body.recipient_user_ids
      : members.map(m => m.user_id);

    // Map notification type to the pref key in site_settings.notification_preferences
    const prefKeyMap: Record<string, string> = {
      weekly_summary: "weekly_summary",
      daily_digest: "daily_digest",
      lead_realtime: "lead_realtime_email",
      lead_digest: "lead_email_digest",
    };
    const prefKey = prefKeyMap[body.type];

    // Get site_settings for this org to check notification_preferences
    const { data: settings } = await supabase
      .from("site_settings")
      .select("notification_preferences")
      .eq("org_id", body.org_id)
      .maybeSingle();

    const prefs = (settings?.notification_preferences as Record<string, boolean>) || {};
    
    // If the preference is explicitly disabled, skip
    if (prefKey && prefs[prefKey] === false) {
      return new Response(JSON.stringify({ sent: 0, reason: "preference_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const userId of userIds) {
      // Get user email from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile?.email) continue;

      // Check suppression list
      const { data: suppressed } = await supabase
        .from("suppressed_emails")
        .select("id")
        .eq("email", profile.email)
        .maybeSingle();

      if (suppressed) continue;

      // Enqueue via pgmq
      const messageId = `${body.type}-${body.org_id}-${userId}-${new Date().toISOString().split("T")[0]}`;

      try {
        await supabase.rpc("enqueue_email", {
          p_queue_name: "transactional_emails",
          p_to: profile.email,
          p_from: `${SITE_NAME} <notifications@${FROM_DOMAIN}>`,
          p_sender_domain: SENDER_DOMAIN,
          p_subject: body.subject,
          p_html: body.html_body,
          p_text: body.text_body || "",
          p_purpose: "transactional",
          p_message_id: messageId,
          p_template_name: body.type,
        });
        sent++;
      } catch (e) {
        console.error(`Failed to enqueue email for ${profile.email}:`, e);
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-notification-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
