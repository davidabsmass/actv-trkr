import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_NAME = "ACTV TRKR";
const SENDER_DOMAIN = "notify.actvtrkr.com";
const FROM_DOMAIN = "actvtrkr.com";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
async function getOrCreateUnsubscribeToken(supabase: any, email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();

  const { data: existing } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existing?.token) return existing.token;

  const token = generateToken();
  await supabase.from("email_unsubscribe_tokens").upsert(
    { token, email: normalizedEmail },
    { onConflict: "email", ignoreDuplicates: true }
  );

  const { data: stored } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .maybeSingle();

  return stored?.token || token;
}

interface NotificationEmailRequest {
  type: "weekly_summary" | "daily_digest" | "lead_realtime" | "lead_digest";
  org_id: string;
  subject: string;
  html_body: string;
  text_body?: string;
  recipient_user_ids?: string[];
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

    const prefKeyMap: Record<string, string> = {
      weekly_summary: "weekly_summary",
      daily_digest: "daily_digest",
      lead_realtime: "lead_realtime_email",
      lead_digest: "lead_email_digest",
    };
    const prefKey = prefKeyMap[body.type];

    const { data: settings } = await supabase
      .from("site_settings")
      .select("notification_preferences")
      .eq("org_id", body.org_id)
      .maybeSingle();

    const prefs = (settings?.notification_preferences as Record<string, boolean>) || {};
    
    if (prefKey && prefs[prefKey] === false) {
      return new Response(JSON.stringify({ sent: 0, reason: "preference_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const userId of userIds) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile?.email) continue;

      const { data: suppressed } = await supabase
        .from("suppressed_emails")
        .select("id")
        .eq("email", profile.email)
        .maybeSingle();

      if (suppressed) continue;

      const messageId = `${body.type}-${body.org_id}-${userId}-${new Date().toISOString().split("T")[0]}`;

      try {
        const unsubscribeToken = await getOrCreateUnsubscribeToken(supabase, profile.email);

        const { error: enqueueError } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to: profile.email,
            from: `${SITE_NAME} <notifications@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: body.subject,
            html: body.html_body,
            text: body.text_body || "",
            purpose: "transactional",
            message_id: messageId,
            label: body.type,
            idempotency_key: messageId,
            unsubscribe_token: unsubscribeToken,
            queued_at: new Date().toISOString(),
          },
        });

        if (enqueueError) {
          console.error(`enqueue_email error for ${profile.email}:`, enqueueError);
        } else {
          sent++;
        }
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
