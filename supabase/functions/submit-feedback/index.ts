import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

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

    // Verify user
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

    // Insert feedback
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

    if (insertError) {
      throw insertError;
    }

    // Get org name for email
    const { data: org } = await supabase
      .from("orgs")
      .select("name")
      .eq("id", org_id)
      .single();

    const orgName = org?.name || "Unknown Org";
    const userEmail = user.email || "Unknown";
    const websiteRow = website_url ? `<tr><td style="padding: 8px; font-weight: bold; color: #666;">Website</td><td style="padding: 8px;">${website_url}</td></tr>` : "";

    // Build email HTML
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

    // Generate unsubscribe token
    const token = crypto.randomUUID();
    await supabase.from("email_unsubscribe_tokens").insert({
      email: "info@newuniformdesign.com",
      token,
    });

    // Enqueue email
    await supabase.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        to: "info@newuniformdesign.com",
        subject: `[Feedback] ${category || "bug"}: ${subject}`,
        html,
        from: "ACTV TRKR <notifications@notify.actvtrkr.com>",
        unsubscribe_token: token,
      },
    });

    return new Response(JSON.stringify({ success: true, feedback }), {
      status: 200,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
