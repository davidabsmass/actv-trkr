// Shared step-up auth helpers for sensitive admin actions.
//
// Usage in an admin edge function:
//   const stepUp = await requireStepUp(req, callerUserId);
//   if (!stepUp.ok) return stepUp.response;
//
// Token lifecycle:
//   1. Admin re-enters their password → `admin-step-up` function verifies
//      it and issues a token (returned in the response body).
//   2. Client stores the token in memory and includes it as the
//      `x-step-up-token` header on sensitive admin requests for the
//      next 15 minutes.
//   3. Server hashes the header, looks it up, checks expiry, and
//      either accepts or rejects.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { appCorsHeaders } from "./cors.ts";

const TOKEN_TTL_MINUTES = 15;

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return _admin;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Issue a fresh step-up token for the given user. Returns the plaintext
 * token (only sent back to the caller in the HTTP response).
 */
export async function issueStepUpToken(opts: {
  userId: string;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: string }> {
  // 32 bytes of randomness, base64url-encoded
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  await admin().from("admin_step_up_tokens").insert({
    user_id: opts.userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: opts.ipHash ?? null,
    user_agent: opts.userAgent ?? null,
  });

  return { token, expiresAt };
}

/**
 * Validate the `x-step-up-token` header for the current request.
 * Returns either { ok: true } or { ok: false, response } where response
 * is a 401 ready to be returned to the client.
 */
export async function requireStepUp(
  req: Request,
  userId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const token = req.headers.get("x-step-up-token") || "";
  if (!token) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "step_up_required", message: "Re-enter your password to continue." }),
        {
          status: 401,
          headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        },
      ),
    };
  }
  const tokenHash = await sha256(token);
  const { data: row } = await admin()
    .from("admin_step_up_tokens")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row || row.user_id !== userId) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "step_up_invalid", message: "Step-up token invalid." }),
        { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
      ),
    };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "step_up_expired", message: "Step-up expired. Re-enter your password." }),
        { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } },
      ),
    };
  }
  return { ok: true };
}
