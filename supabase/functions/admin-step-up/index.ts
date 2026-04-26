// Step-up authentication: verifies the caller's current password and
// issues a short-lived (15 min) token usable for sensitive admin
// actions like viewing customer billing or destructive operations.
//
// Why a separate function instead of just requiring the JWT?
//   - A leaked or hijacked browser session is enough to call any
//     admin endpoint. Step-up forces the attacker to ALSO know the
//     current password before billing data, IDs, or destructive
//     actions become available.

import { appCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { issueStepUpToken } from "../_shared/step-up.ts";
import { logSecurityEvent, hashIp, extractClientIp, newRequestId } from "../_shared/security-audit.ts";
import { notifyAuthEvent } from "../_shared/notify-auth-event.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: appCorsHeaders(req) });
  const requestId = newRequestId();
  const userAgent = req.headers.get("user-agent");
  const ip = extractClientIp(req);
  const ipHash = ip ? await hashIp(ip) : null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401, req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller || !caller.email) return json({ error: "Not authenticated" }, 401, req);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      await logSecurityEvent({
        event_type: "step_up_denied_not_admin", severity: "warn", actor_type: "user",
        user_id: caller.id, ip_hash: ipHash, user_agent: userAgent, request_id: requestId,
      });
      return json({ error: "Admin access required" }, 403, req);
    }

    const body = await req.json().catch(() => ({}));
    const password = String(body.password || "");
    if (!password) return json({ error: "password required" }, 400, req);

    // Re-verify password by attempting a fresh sign-in. We do NOT touch
    // the existing session — `signInWithPassword` against the anon
    // client just validates credentials.
    const verifyClient = createClient(supabaseUrl, anonKey);
    const { error: signInError } = await verifyClient.auth.signInWithPassword({
      email: caller.email, password,
    });
    if (signInError) {
      await logSecurityEvent({
        event_type: "step_up_password_failed", severity: "warn", actor_type: "admin",
        user_id: caller.id, ip_hash: ipHash, user_agent: userAgent, request_id: requestId,
        message: "Step-up password verification failed",
      });
      // Fire-and-forget alert to the account owner: someone with this session
      // tried to re-verify the admin password and got it wrong.
      notifyAuthEvent({
        userId: caller.id,
        eventType: "step_up_failed",
        ip,
        userAgent,
      }).catch(() => { /* swallowed inside helper */ });
      return json({ error: "Invalid password" }, 401, req);
    }

    const { token, expiresAt } = await issueStepUpToken({
      userId: caller.id, ipHash, userAgent,
    });
    await logSecurityEvent({
      event_type: "step_up_issued", severity: "info", actor_type: "admin",
      user_id: caller.id, ip_hash: ipHash, user_agent: userAgent, request_id: requestId,
      message: "Step-up token issued",
    });
    return json({ ok: true, token, expires_at: expiresAt }, 200, req);
  } catch (err) {
    return json({ error: (err as Error).message }, 500, req);
  }
});

function json(payload: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
  });
}
