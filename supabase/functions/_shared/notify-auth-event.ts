// Tiny helper to fire-and-forget a notify-auth-event call from any edge function.
// We use the service role key as the bearer credential since this is a
// server-to-server call inside the same Supabase project.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AuthAlertEventType =
  | "new_device_login"
  | "password_changed"
  | "email_changed"
  | "password_reset_requested"
  | "too_many_failed_logins"
  | "step_up_failed"
  | "mfa_code_new_device";

export interface AuthAlertPayload {
  userId: string;
  eventType: AuthAlertEventType;
  ip?: string | null;
  userAgent?: string | null;
  geoHint?: string | null;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
  showKillButton?: boolean;
}

/**
 * Fire-and-forget notify-auth-event call.
 *
 * Never throws — failures are logged and swallowed so they cannot break
 * the caller's primary flow. The caller should NOT `await` the result if
 * latency matters; for correctness we still return the promise.
 */
export async function notifyAuthEvent(payload: AuthAlertPayload): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-auth-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("notifyAuthEvent failed", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("notifyAuthEvent threw", (e as Error).message);
  }
}
