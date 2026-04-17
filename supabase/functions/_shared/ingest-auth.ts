/**
 * Shared authentication for ingestion endpoints.
 *
 * Accepts EITHER:
 *   1. A narrow-scope site ingest token (preferred, plugin v1.9.17+).
 *      - Sent via header `X-Ingest-Token` or body field `ingest_token`.
 *      - Bound to a single site_id and limited to ingestion scope.
 *      - Safe to expose in page source (cannot magic-login, cannot read data).
 *
 *   2. The legacy admin API key (deprecated, still accepted during migration).
 *      - Sent via `Authorization: Bearer <key>` or body field `api_key`.
 *      - Logs `deprecated_auth_on_ingest` security event so we can identify
 *        sites still leaking the admin key in their page source.
 *
 * After the 30-day deprecation window, callers should remove the legacy
 * fallback and require an ingest token.
 */
import { logSecurityEvent, hashIpForAudit } from "./security-audit.ts";

export type IngestAuthResult =
  | {
      ok: true;
      orgId: string;
      siteId: string | null; // bound site_id when using ingest token; null for legacy
      authMethod: "ingest_token" | "legacy_api_key";
      tokenId?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractIngestToken(req: Request, body: any): string | null {
  const headerVal = req.headers.get("x-ingest-token");
  if (headerVal && headerVal.trim()) return headerVal.trim();
  if (body && typeof body.ingest_token === "string" && body.ingest_token.trim()) {
    return body.ingest_token.trim();
  }
  return null;
}

function extractLegacyApiKey(req: Request, body: any): string | null {
  // Headers used by various ingest endpoints historically
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  const xKey = req.headers.get("x-actvtrkr-key");
  if (xKey && xKey.trim()) return xKey.trim();
  if (body && typeof body.api_key === "string" && body.api_key.trim()) {
    return body.api_key.trim();
  }
  return null;
}

export async function authenticateIngestRequest(opts: {
  req: Request;
  body: any;
  supabase: any; // service-role client
  endpoint: string; // e.g. "track-pageview"
  requestId?: string;
}): Promise<IngestAuthResult> {
  const { req, body, supabase, endpoint, requestId } = opts;

  // ── 1. Try the new ingest token first ─────────────────────────
  const ingestToken = extractIngestToken(req, body);
  if (ingestToken) {
    if (ingestToken.length < 32 || ingestToken.length > 256) {
      return { ok: false, status: 401, error: "Invalid ingest token format" };
    }
    const hash = await sha256Hex(ingestToken);
    const { data: tokenRow } = await supabase
      .from("site_ingest_tokens")
      .select("id, org_id, site_id, status, revoked_at")
      .eq("token_hash", hash)
      .eq("status", "active")
      .is("revoked_at", null)
      .maybeSingle();

    if (!tokenRow) {
      return { ok: false, status: 401, error: "Invalid or revoked ingest token" };
    }

    // Best-effort last_used_at update (non-blocking)
    supabase
      .from("site_ingest_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id)
      .then(() => {})
      .catch(() => {});

    return {
      ok: true,
      orgId: tokenRow.org_id,
      siteId: tokenRow.site_id,
      authMethod: "ingest_token",
      tokenId: tokenRow.id,
    };
  }

  // ── 2. Fall back to legacy admin API key ──────────────────────
  const legacyKey = extractLegacyApiKey(req, body);
  if (!legacyKey) {
    return { ok: false, status: 401, error: "Missing credentials" };
  }
  if (legacyKey.length > 256) {
    return { ok: false, status: 401, error: "Invalid credential format" };
  }

  // SECURITY: a SHA-256 hex hash of the raw key must NOT be accepted as
  // a credential. Reject anything that looks like a 64-char hex string
  // submitted as the API key — that is the stored shape.
  if (/^[a-f0-9]{64}$/i.test(legacyKey)) {
    return { ok: false, status: 401, error: "Invalid credential" };
  }

  const keyHash = await sha256Hex(legacyKey);
  const { data: akRow } = await supabase
    .from("api_keys")
    .select("org_id")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!akRow) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }

  // Log the deprecated usage so we can hunt down sites still leaking
  // the admin key in page source. Fire-and-forget.
  try {
    const ipHash = await hashIpForAudit(req);
    await logSecurityEvent(supabase, {
      event_type: "deprecated_auth_on_ingest",
      severity: "warn",
      org_id: akRow.org_id,
      actor_type: "site",
      message: `Legacy admin API key used on ${endpoint}`,
      metadata: { endpoint },
      ip_hash: ipHash,
      user_agent: req.headers.get("user-agent"),
      request_id: requestId,
    });
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    orgId: akRow.org_id,
    siteId: null,
    authMethod: "legacy_api_key",
  };
}
