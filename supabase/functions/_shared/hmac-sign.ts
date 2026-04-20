/**
 * HMAC-SHA256 signing for backend ↔ WordPress plugin requests.
 *
 * SECURITY (C-2):
 *   The stored `api_keys.key_hash` MUST NOT be usable as a credential.
 *   Every backend → plugin call signs a (timestamp, nonce, body) tuple
 *   with the per-org `signing_secret`. The plugin verifies the signature,
 *   checks the timestamp window, and rejects replays.
 *
 *   Phase 1 (v1.18.x): backend SIGNS, plugin ACCEPTS BOTH (signed or legacy hash).
 *   Phase 2 (v1.19.0): plugin REJECTS legacy hash; signed-only.
 */

const HEADER_TIMESTAMP = "X-Actv-Timestamp";
const HEADER_NONCE = "X-Actv-Nonce";
const HEADER_SIGNATURE = "X-Actv-Signature";
const HEADER_KEY_ID = "X-Actv-Key-Id";

export const SIGNED_REQUEST_HEADERS = {
  HEADER_TIMESTAMP,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_KEY_ID,
};

/** Build the canonical string the plugin will reconstruct & verify. */
function canonicalString(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}`;
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SignedRequestHeaders {
  [k: string]: string;
}

/**
 * Build the headers backend should attach to a plugin-bound request.
 * Returns an empty object if `signingSecret` is missing — caller decides
 * whether to fall back to legacy hash auth (Phase 1) or refuse (Phase 2).
 */
export async function buildSignedHeaders(
  signingSecret: string | null | undefined,
  apiKeyId: string | null | undefined,
  body: string,
): Promise<SignedRequestHeaders> {
  if (!signingSecret) return {};
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce();
  const signature = await hmacSha256Hex(
    signingSecret,
    canonicalString(timestamp, nonce, body),
  );
  const headers: SignedRequestHeaders = {
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
  if (apiKeyId) headers[HEADER_KEY_ID] = apiKeyId;
  return headers;
}
