import { appCorsHeaders } from '../_shared/cors.ts'
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Manage org membership: change role or remove a member.
 * Body: { action: "change_role" | "remove", orgId, targetUserId, newRole? }
 *
 * Enforced rules (defense in depth alongside DB triggers):
 * - Caller must be org admin or platform admin.
 * - Cannot remove the org owner.
 * - Cannot remove or demote the last admin.
 * - Cannot promote yourself unless you're already an admin.
 * - Audit log written for every action.
 */
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
    const action: string = String(body?.action || "");
    const orgId: string = String(body?.orgId || "");
    const targetUserId: string = String(body?.targetUserId || "");
    const newRole: string = String(body?.newRole || "").toLowerCase();

    if (!orgId || !targetUserId || !["change_role", "remove"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Authorize caller
    const { data: callerRow } = await admin
      .from("org_users")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: platformRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isOrgAdmin = callerRow?.role === "admin";
    const isPlatformAdmin = !!platformRow;

    if (!isOrgAdmin && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Only org admins can manage members" }), { status: 403, headers });
    }

    const { data: target } = await admin
      .from("org_users")
      .select("id, role, is_owner, user_id")
      .eq("org_id", orgId)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!target) {
      return new Response(JSON.stringify({ error: "Member not found" }), { status: 404, headers });
    }

    // Self-promotion guard (caller cannot promote themselves to admin if not already admin)
    if (action === "change_role" && newRole === "admin" && targetUserId === user.id && !isOrgAdmin && !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Cannot promote yourself" }), { status: 403, headers });
    }

    if (action === "change_role") {
      const validRoles = ["manager", "admin"];
      const normalizedNewRole = newRole === "viewer" ? "manager" : newRole;
      if (!validRoles.includes(normalizedNewRole)) {
        return new Response(JSON.stringify({ error: "Invalid role. Must be 'manager' or 'admin'." }), { status: 400, headers });
      }
      if (target.is_owner) {
        return new Response(JSON.stringify({ error: "Cannot change the role of the organization owner" }), { status: 403, headers });
      }

      const previousRole = target.role;
      const { error: updErr } = await admin
        .from("org_users")
        .update({ role: newRole })
        .eq("id", target.id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers });
      }

      let logAction = "user_role_changed";
      if (previousRole !== "admin" && newRole === "admin") logAction = "admin_added";
      else if (previousRole === "admin" && newRole !== "admin") logAction = "admin_removed";

      await admin.from("team_audit_log").insert({
        org_id: orgId,
        actor_user_id: user.id,
        target_user_id: targetUserId,
        action: logAction,
        previous_role: previousRole,
        new_role: newRole,
      });

      return new Response(JSON.stringify({ success: true, role: newRole }), { status: 200, headers });
    }

    if (action === "remove") {
      if (target.is_owner) {
        return new Response(JSON.stringify({ error: "Cannot remove the organization owner" }), { status: 403, headers });
      }
      if (targetUserId === user.id && isOrgAdmin) {
        // Block self-removal if last admin
        const { count } = await admin
          .from("org_users")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("role", "admin");
        if ((count ?? 0) <= 1) {
          return new Response(JSON.stringify({ error: "You are the last admin. Promote another admin first." }), { status: 403, headers });
        }
      }
      const { error: delErr } = await admin
        .from("org_users")
        .delete()
        .eq("id", target.id);
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), { status: 400, headers });
      }

      await admin.from("team_audit_log").insert({
        org_id: orgId,
        actor_user_id: user.id,
        target_user_id: targetUserId,
        action: "user_removed",
        previous_role: target.role,
        new_role: null,
      });

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers });
  } catch (err) {
    console.error("manage-org-member error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers });
  }
});
