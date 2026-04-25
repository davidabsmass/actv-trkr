/**
 * Server-side security audit helpers.
 *
 * Centralizes:
 *   - structured security event logging (writes to security_audit_log)
 *   - webhook verification logging
 *   - IP hashing (re-export from ingestion-security)
 *   - request ID generation
 *
 * These helpers are best-effort and never throw — a failing audit write
 * must not break the parent request.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

let _adminClient: ReturnType<typeof createClient> | null = null;
function adminClient() {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return _adminClient;
}

export type Severity = "info" | "warn" | "error" | "critical";
export type ActorType = "system" | "admin" | "user" | "plugin" | "webhook" | "anonymous";

export interface SecurityEvent {
  event_type: string;
  severity?: Severity;
  org_id?: string | null;
  site_id?: string | null;
  user_id?: string | null;
  actor_type?: ActorType;
  message?: string | null;
  metadata?: Record<string, unknown>;
  ip_hash?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
}

/**
 * Fire-and-forget audit log write. Returns the inserted id (or null on failure).
 * Never throws.
 */
export async function logSecurityEvent(evt: SecurityEvent): Promise<string | null> {
  try {
    const sb = adminClient() as any;
    const { data, error } = await sb.rpc("log_security_event", {
      p_event_type: evt.event_type,
      p_severity: evt.severity ?? "info",
      p_org_id: evt.org_id ?? null,
      p_site_id: evt.site_id ?? null,
      p_user_id: evt.user_id ?? null,
      p_actor_type: evt.actor_type ?? "system",
      p_message: evt.message ?? null,
      p_metadata: evt.metadata ?? {},
      p_ip_hash: evt.ip_hash ?? null,
      p_user_agent: evt.user_agent ?? null,
      p_request_id: evt.request_id ?? null,
    } as any);
    if (error) {
      console.error("[security-audit] log_security_event failed:", error.message);
      return null;
    }
    return (data as unknown as string) ?? null;
  } catch (err) {
    console.error("[security-audit] unexpected:", err);
    return null;
  }
}

/**
 * Record a webhook verification outcome (Stripe, etc.).
 */
export async function logWebhookVerification(input: {
  provider: string;
  event_id?: string | null;
  status: "verified" | "signature_invalid" | "replay_rejected" | "idempotent_skip" | "processing_error";
  failure_reason?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = adminClient() as any;
    await sb.from("webhook_verification_log").insert({
      provider: input.provider,
      event_id: input.event_id ?? null,
      verification_status: input.status,
      failure_reason: input.failure_reason ?? null,
      request_id: input.request_id ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    console.error("[security-audit] logWebhookVerification failed:", err);
  }
}

/**
 * Generate a short request ID for correlation across logs.
 */
export function newRequestId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Re-export IP hashing for convenience (kept consistent with ingestion-security).
 */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "_actv_salt_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function extractClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
