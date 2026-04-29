import { createClient } from "npm:@supabase/supabase-js@2";

type AdminClient = ReturnType<typeof createClient>;

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function resolveUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  if (profile?.user_id) return profile.user_id;

  // deno-lint-ignore no-explicit-any
  const adminAny = admin.auth.admin as any;
  if (typeof adminAny.getUserByEmail === "function") {
    const { data } = await adminAny.getUserByEmail(normalizedEmail);
    if (data?.user?.id) return data.user.id;
  }

  return null;
}

export async function createPasswordResetUrl(
  admin: AdminClient,
  email: string,
  redirectTo: string,
  userId?: string | null,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const resolvedUserId = userId || await resolveUserIdByEmail(admin, normalizedEmail);
  if (!resolvedUserId) return null;

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await admin
    .from("password_reset_links")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", resolvedUserId)
    .is("consumed_at", null);

  const { error } = await admin.from("password_reset_links").insert({
    user_id: resolvedUserId,
    email: normalizedEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (error) throw error;

  const base = redirectTo || "https://actvtrkr.com/reset-password";
  const url = new URL(base);
  url.pathname = "/reset-password";
  url.searchParams.set("token", token);
  url.searchParams.set("email", normalizedEmail);
  return url.toString();
}