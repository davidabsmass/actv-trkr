import { appCorsHeaders } from '../_shared/cors.ts'
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
    const email: string = String(body?.email || "").trim().toLowerCase();
    const orgId: string = String(body?.orgId || "").trim();
    const requestedRole: string = String(body?.role || "manager").toLowerCase();

    if (!email || !orgId) {
      return new Response(JSON.stringify({ error: "Email and orgId are required" }), { status: 400, headers });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers });
    }

    // SECURITY: Default invited users to 'manager'. Only admins can be promoted later.
    // Legacy 'viewer' role is mapped to 'manager' for backward compatibility.
    const normalizedRole = requestedRole === "viewer" ? "manager" : requestedRole;
    const validRoles = ["manager", "admin"];
    const assignRole = validRoles.includes(normalizedRole) ? normalizedRole : "manager";

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is an admin of this org (or platform admin)
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

    const isPlatformAdmin = !!platformRole;
    const isOrgAdmin = callerRole?.role === "admin";

    if (!isOrgAdmin && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Only org admins can invite members" }), { status: 403, headers });
    }

    // Look up existing user by email
    const { data: profileMatch } = await admin
      .from("profiles")
      .select("user_id, email, full_name")
      .eq("email", email)
      .maybeSingle();

    let targetUserId: string;
    let wasCreated = false;

    if (profileMatch) {
      targetUserId = profileMatch.user_id;

      const { data: existing } = await admin
        .from("org_users")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "This user is already a member of your organization" }),
          { status: 400, headers }
        );
      }
    } else {
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: "" },
      });
      if (createErr || !newUser?.user) {
        return new Response(
          JSON.stringify({ error: createErr?.message || "Failed to create user account" }),
          { status: 500, headers }
        );
      }
      targetUserId = newUser.user.id;
      wasCreated = true;
    }

    const { error: joinErr } = await admin
      .from("org_users")
      .insert({
        org_id: orgId,
        user_id: targetUserId,
        role: assignRole,
        invited_by: user.id,
        status: "active",
      });

    if (joinErr) {
      console.error("Join error:", joinErr);
      return new Response(JSON.stringify({ error: joinErr.message || "Failed to add member" }), { status: 500, headers });
    }

    // Audit log
    await admin.from("team_audit_log").insert({
      org_id: orgId,
      actor_user_id: user.id,
      target_user_id: targetUserId,
      action: assignRole === "admin" ? "admin_added" : "user_invited",
      previous_role: null,
      new_role: assignRole,
      metadata: { email, was_created: wasCreated },
    });

    // Subscriber record (best effort)
    const { data: existingSub } = await admin
      .from("subscribers").select("id").eq("user_id", targetUserId).maybeSingle();
    if (!existingSub) {
      await admin.from("subscribers").insert({
        user_id: targetUserId, org_id: orgId, email,
        status: "active", plan: "team_member",
      });
    }

    // Build the "set password" / accept link the invitee will click
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
      console.warn("generateLink failed, using fallback:", (e as Error)?.message);
    }

    // Inviter + org names for the email
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
        .from("organizations").select("name").eq("id", orgId).maybeSingle();
      orgName = orgRow?.name || "";
    } catch (_) { /* best effort */ }

    // Send the invite email (best effort — never block the membership add)
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
            role: assignRole,
            setPasswordUrl,
          },
        },
      });
    } catch (e) {
      console.error("Failed to send team-invite email:", (e as Error)?.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: targetUserId,
        role: assignRole,
        wasCreated,
        message: wasCreated
          ? `Invitation sent to ${email}. They'll receive an email to set their password.`
          : `${email} added to your organization as ${assignRole}. Invitation email sent.`,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("Add org member error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers });
  }
});
