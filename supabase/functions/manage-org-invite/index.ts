// Resend or cancel a PENDING team invite.
//
// Actions:
//   - resend: regenerate the recovery link, refresh invited_at, re-send the
//     team-invite email, write 'invite_resent' to team_audit_log.
//     Rate limited to 1x / 60s per pending org_user row.
//   - cancel: delete the pending org_users row (status='invited' only).
//     Writes 'invite_cancelled' to team_audit_log. Underlying auth user is
//     left in place (they may belong to other orgs).
//
// Caller must be an admin of the org (or platform admin).

import { appCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  const headers = { ...appCorsHeaders(req), "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), { status: 401, headers });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = String(body?.action || "").toLowerCase();
    const orgId: string = String(body?.orgId || "").trim();
    const targetUserId: string = String(body?.targetUserId || "").trim();

    if (!orgId || !targetUserId || !["resend", "cancel"].includes(action)) {
      return new Response(JSON.stringify({ error: "action, orgId, targetUserId required" }), { status: 400, headers });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Authorize: caller is org admin or platform admin
    const { data: callerRole } = await admin
      .from("org_users")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: platformRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (callerRole?.role !== "admin" && !platformRole) {
      return new Response(JSON.stringify({ error: "Only org admins can manage invites" }), { status: 403, headers });
    }

    // Locate the pending invite row
    const { data: invite } = await admin
      .from("org_users")
      .select("id, status, role, invited_at")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!invite) {
      return new Response(JSON.stringify({ error: "Invite not found" }), { status: 404, headers });
    }
    if (invite.status !== "invited") {
      return new Response(JSON.stringify({ error: "This member has already accepted the invite" }), { status: 400, headers });
    }

    // Recipient profile
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const email = profile?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "Could not resolve invitee email" }), { status: 500, headers });
    }

    // ── CANCEL ──
    if (action === "cancel") {
      const { error: delErr } = await admin
        .from("org_users")
        .delete()
        .eq("id", invite.id)
        .eq("status", "invited"); // safety: only delete still-pending rows

      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), { status: 500, headers });
      }

      await admin.from("team_audit_log").insert({
        org_id: orgId,
        actor_user_id: user.id,
        target_user_id: targetUserId,
        action: "invite_cancelled",
        previous_role: invite.role,
        new_role: null,
        metadata: { email },
      });

      return new Response(JSON.stringify({ success: true, message: "Invitation cancelled" }), { status: 200, headers });
    }

    // ── RESEND ──
    // Rate limit: once per 60s per invite
    if (invite.invited_at) {
      const last = new Date(invite.invited_at).getTime();
      if (Date.now() - last < 60_000) {
        const wait = Math.ceil((60_000 - (Date.now() - last)) / 1000);
        return new Response(
          JSON.stringify({ error: `Please wait ${wait}s before resending.` }),
          { status: 429, headers }
        );
      }
    }

    const APP_URL = Deno.env.get("APP_URL") || "https://actvtrkr.com";
    let setPasswordUrl = `${APP_URL}/auth`;
    try {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${APP_URL}/reset-password` },
      });
      if (!linkErr && linkData?.properties?.action_link) {
        setPasswordUrl = linkData.properties.action_link;
      }
    } catch (e) {
      console.warn("generateLink failed:", (e as Error)?.message);
    }

    // Inviter + org names
    let inviterName = "";
    let inviterEmail = "";
    try {
      const { data: inviterProfile } = await admin
        .from("profiles").select("full_name, email").eq("user_id", user.id).maybeSingle();
      inviterName = inviterProfile?.full_name || "";
      inviterEmail = inviterProfile?.email || user.email || "";
    } catch (_) { /* best effort */ }

    let orgName = "";
    try {
      const { data: orgRow } = await admin
        .from("orgs").select("name").eq("id", orgId).maybeSingle();
      orgName = orgRow?.name || "";
    } catch (_) { /* best effort */ }

    // Refresh invited_at first so client sees the updated timestamp
    const nowIso = new Date().toISOString();
    await admin
      .from("org_users")
      .update({ invited_at: nowIso, updated_at: nowIso })
      .eq("id", invite.id);

    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "team-invite",
          recipientEmail: email,
          idempotencyKey: `team-invite-${orgId}-${targetUserId}-${Date.now()}`,
          templateData: {
            inviterName,
            inviterEmail,
            orgName,
            role: invite.role,
            setPasswordUrl,
          },
        },
      });
    } catch (e) {
      console.error("Failed to resend team-invite email:", (e as Error)?.message);
      return new Response(JSON.stringify({ error: "Failed to send email" }), { status: 500, headers });
    }

    await admin.from("team_audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      target_user_id: targetUserId,
      action: "invite_resent",
      previous_role: null,
      new_role: invite.role,
      metadata: { email },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Invitation resent to ${email}` }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("manage-org-invite error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers });
  }
});
