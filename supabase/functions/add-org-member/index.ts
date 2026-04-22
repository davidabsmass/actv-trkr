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

    const { email, orgId, role = "member" } = await req.json();

    if (!email || !orgId) {
      return new Response(JSON.stringify({ error: "Email and orgId are required" }), { status: 400, headers });
    }

    const validRoles = ["member", "admin"];
    const assignRole = validRoles.includes(role) ? role : "member";

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is an admin of this org
    const { data: callerRole } = await admin
      .from("org_users")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!callerRole || callerRole.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only org admins can add members" }), { status: 403, headers });
    }

    // Check if user exists in auth by email
    const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1, page: 1 });
    // listUsers doesn't filter by email, so use a different approach
    const { data: profileMatch } = await admin
      .from("profiles")
      .select("user_id, email, full_name")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    let targetUserId: string;
    let targetName = "";
    let wasCreated = false;

    if (profileMatch) {
      targetUserId = profileMatch.user_id;
      targetName = profileMatch.full_name || "";

      // Check if already a member
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
      // Create the user account with a random password (they'll use password reset)
      const tempPassword = crypto.randomUUID() + "Aa1!";
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: "" },
      });

      if (createErr || !newUser?.user) {
        console.error("Create user error:", createErr);
        return new Response(
          JSON.stringify({ error: createErr?.message || "Failed to create user account" }),
          { status: 500, headers }
        );
      }

      targetUserId = newUser.user.id;
      wasCreated = true;
    }

    // Add to org
    const { error: joinErr } = await admin
      .from("org_users")
      .insert({ org_id: orgId, user_id: targetUserId, role: assignRole });

    if (joinErr) {
      console.error("Join error:", joinErr);
      return new Response(JSON.stringify({ error: "Failed to add member" }), { status: 500, headers });
    }

    // Also create a subscriber record if one doesn't exist
    const { data: existingSub } = await admin
      .from("subscribers")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!existingSub) {
      await admin.from("subscribers").insert({
        user_id: targetUserId,
        org_id: orgId,
        email: email.toLowerCase().trim(),
        status: "active",
        plan: "team_member",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: targetUserId,
        wasCreated,
        message: wasCreated
          ? `Account created for ${email}. They should use "Forgot Password" to set their password.`
          : `${email} has been added to your organization.`,
      }),
      { status: 200, headers }
    );
  } catch (err) {
    console.error("Add org member error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers });
  }
});
