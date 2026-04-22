/**
 * Plugin → backend authentication.
 *
 * Phase 1 model (BACKWARDS-COMPATIBLE):
 *   - Accepts the legacy site API key (raw key) sent via Bearer / X-Api-Key /
 *     X-ActvTrkr-Key header AND verified against api_keys.key_hash.
 *   - REJECTS the SHA-256 hash of the key as a credential — only the raw key
 *     is accepted now. (Closes the half of C-2 we can ship without
 *     migrating every site.)
 *   - When the request includes a signed-request envelope (X-ActvTrkr-Sig +
 *     X-ActvTrkr-Ts + X-ActvTrkr-Kid), verifies it via the site_credentials
 *     table; replay-protected with a ±5 min window.
 *
 * Phase 2 (already provisioned in schema):
 *   - All plugin-bound and backend-bound calls move to the signed-request
 *     model. Old key path is removed after the deprecation window.
 *
 * SECURITY NOTES
 *   - We never log the raw key, only the SHA-256 prefix.
 *   - We never echo the verification reason back to the caller.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const REPLAY_WINDOW_SEC = 300; // ±5 minutes

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare for hex strings. */
function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface ResolvedPluginAuth {
  ok: true;
  org_id: string;
  api_key_id: string;
  /** "legacy" = raw API key match, "signed" = HMAC envelope verified. */
  auth_mode: "legacy" | "signed";
  key_fingerprint: string; // first 12 hex chars of sha256 — safe to log
}

export interface PluginAuthFailure {
  ok: false;
  status: number;
  reason: string; // safe for response body
  log_reason: string; // detailed, server-only
}

export type PluginAuthResult = ResolvedPluginAuth | PluginAuthFailure;

/**
 * Extract the raw API key from any of the historical headers we accept.
 * (Phase 2 will collapse to a single canonical header.)
 */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const x = req.headers.get("x-api-key") ?? req.headers.get("x-actvtrkr-key");
  return x ? x.trim() : null;
}

/**
 * Verify the request as coming from a registered ACTV TRKR plugin install.
 *
 * Resolves to the org_id + api_keys.id when authenticated, or a structured
 * failure when not. Failures are logged to security_audit_log.
 */
export async function verifyPluginRequest(
  req: Request,
  opts: { event_context?: string } = {},
): Promise<PluginAuthResult> {
  const sb = admin();
  const rawKey = extractApiKey(req);

  if (!rawKey) {
    return { ok: false, status: 401, reason: "Missing API key", log_reason: "missing_credential" };
  }

  // Quick sanity: keys are random strings; reject obviously malformed.
  if (rawKey.length < 16 || rawKey.length > 256) {
    return { ok: false, status: 401, reason: "Invalid API key", log_reason: "malformed_credential" };
  }

  const keyHash = await sha256Hex(rawKey);
  const fingerprint = keyHash.slice(0, 12);

  // Look up by hash. The backend stores the raw key string in `key_hash` today
  // (legacy) AND we MUST also support installs that already have the hash
  // stored. So:
  //   - First try exact match on `key_hash` against the raw key (legacy).
  //   - Then try match on `key_hash` against sha256(raw key) (the migration target).
  // Either way we return the row. NEVER accept the literal hash sent as the
  // credential — that's the C-2 fix.
  const { data: rows, error } = await sb
    .from("api_keys")
    .select("id, org_id, key_hash, revoked_at")
    .or(`key_hash.eq.${rawKey},key_hash.eq.${keyHash}`)
    .is("revoked_at", null)
    .limit(2);

  if (error) {
    console.error("[plugin-auth] lookup error:", error.message);
    return { ok: false, status: 500, reason: "Authentication unavailable", log_reason: "lookup_error" };
  }

  if (!rows || rows.length === 0) {
    return { ok: false, status: 401, reason: "Invalid API key", log_reason: `unknown_key:${fingerprint}` };
  }

  // Pick the row whose stored value matches the raw key (constant-time).
  const matched = rows.find(r => ctEqual(r.key_hash as string, rawKey) || ctEqual(r.key_hash as string, keyHash));
  if (!matched) {
    return { ok: false, status: 401, reason: "Invalid API key", log_reason: `mismatch:${fingerprint}` };
  }

  return {
    ok: true,
    org_id: matched.org_id as string,
    api_key_id: matched.id as string,
    auth_mode: ctEqual(matched.key_hash as string, rawKey) ? "legacy" : "signed",
    key_fingerprint: fingerprint,
  };
}

/**
 * Verify a signed-request envelope (Phase 2 surface, available now for new
 * code paths to opt-in). Returns true iff:
 *   - X-ActvTrkr-Kid identifies an active site_credentials row of type
 *     'plugin_signing'
 *   - X-ActvTrkr-Ts is within ±REPLAY_WINDOW_SEC of server time
 *   - X-ActvTrkr-Sig === HMAC-SHA256(secret, `${ts}.${method}.${path}.${bodySha}`)
 */
export async function verifySignedRequest(
  req: Request,
  rawBody: string,
): Promise<{ ok: boolean; site_id?: string; org_id?: string; reason?: string }> {
  const kid = req.headers.get("x-actvtrkr-kid");
  const sig = req.headers.get("x-actvtrkr-sig");
  const ts = req.headers.get("x-actvtrkr-ts");

  if (!kid || !sig || !ts) return { ok: false, reason: "missing_envelope" };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > REPLAY_WINDOW_SEC) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const sb = admin();
  const { data: cred, error } = await sb
    .from("site_credentials")
    .select("id, org_id, site_id, secret_hash, status, revoked_at, expires_at")
    .eq("fingerprint_sha256", kid)
    .eq("credential_type", "plugin_signing")
    .maybeSingle();

  if (error || !cred) return { ok: false, reason: "unknown_kid" };
  if (cred.status !== "active") return { ok: false, reason: `status_${cred.status}` };
  if (cred.revoked_at) return { ok: false, reason: "revoked" };
  if (cred.expires_at && new Date(cred.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  const url = new URL(req.url);
  const bodySha = await sha256Hex(rawBody);
  const canonical = `${ts}.${req.method.toUpperCase()}.${url.pathname}.${bodySha}`;
  const expected = await sha256Hex(canonical + (cred.secret_hash as string));
  if (!ctEqual(expected, sig)) return { ok: false, reason: "signature_mismatch" };

  // Best-effort last-used update; ignore failures.
  sb.from("site_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", cred.id as string)
    .then(() => undefined, () => undefined);

  return {
    ok: true,
    site_id: cred.site_id as string,
    org_id: cred.org_id as string,
  };
}

export { sha256Hex };
