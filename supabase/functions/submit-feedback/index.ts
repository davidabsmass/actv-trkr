import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const FEEDBACK_RECIPIENT = "annie@newuniformdesign.com";

async function getFeedbackUnsubscribeToken(supabase: any) {
  const normalizedEmail = FEEDBACK_RECIPIENT.toLowerCase();

  const { data: existingToken, error: lookupError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existingToken?.token && !existingToken.used_at) {
    return existingToken.token;
  }

  const nextToken = crypto.randomUUID();
  const { error: upsertError } = await supabase
    .from("email_unsubscribe_tokens")
    .upsert(
      { email: normalizedEmail, token: nextToken, used_at: null },
      { onConflict: "email" },
    );

  if (upsertError) {
    throw upsertError;
  }

  const { data: storedToken, error: readBackError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .single();

  if (readBackError || !storedToken?.token) {
    throw readBackError ?? new Error("Failed to confirm unsubscribe token");
  }

  return storedToken.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: appCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { org_id, category, subject, message, website_url } = await req.json();

    if (!org_id || !subject || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("org_users")
      .select("id")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: feedback, error: insertError } = await supabase
      .from("feedback")
      .insert({
        org_id,
        user_id: user.id,
        category: category || "bug",
        subject,
        message,
      })
      .select()
      .single();

    if (insertError || !feedback) {
      throw insertError ?? new Error("Failed to save feedback");
    }

    const { data: org, error: orgError } = await supabase
      .from("orgs")
      .select("name")
      .eq("id", org_id)
      .single();

    if (orgError) {
      throw orgError;
    }

    const unsubscribeToken = await getFeedbackUnsubscribeToken(supabase);
    const orgName = org?.name || "Unknown Org";
    const userEmail = user.email || "Unknown";
    const websiteRow = website_url
      ? `<tr><td style="padding: 8px; font-weight: bold; color: #666;">Website</td><td style="padding: 8px;">${website_url}</td></tr>`
      : "";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">[Feedback] ${category || "bug"}: ${subject}</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; font-weight: bold; color: #666;">Organization</td><td style="padding: 8px;">${orgName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; color: #666;">User</td><td style="padding: 8px;">${userEmail}</td></tr>
          ${websiteRow}
          <tr><td style="padding: 8px; font-weight: bold; color: #666;">Category</td><td style="padding: 8px;">${category || "bug"}</td></tr>
        </table>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `;

    const { data: queueId, error: enqueueError } = await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        to: FEEDBACK_RECIPIENT,
        subject: `[Feedback] ${category || "bug"}: ${subject}`,
        html,
        from: "ACTV TRKR <notifications@notify.actvtrkr.com>",
        sender_domain: "notify.actvtrkr.com",
        unsubscribe_token: unsubscribeToken,
        purpose: "transactional",
        idempotency_key: feedback.id,
        message_id: feedback.id,
        label: "feedback",
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      throw enqueueError;
    }

    console.log("Queued feedback email", {
      feedbackId: feedback.id,
      queueId,
      recipient: FEEDBACK_RECIPIENT,
    });

    return new Response(JSON.stringify({ success: true, feedback }), {
      status: 200,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("submit-feedback failed", err);

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
