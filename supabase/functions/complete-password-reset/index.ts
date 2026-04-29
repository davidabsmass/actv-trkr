import { createClient } from "npm:@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/password-reset-links.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const password = typeof body?.password === "string" ? String(body.password) : "";

    if (!token) return json({ ok: false, error: "invalid_request" });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const tokenHash = await sha256Hex(token);
    const { data: resetRow, error: lookupError } = await admin
      .from("password_reset_links")
      .select("id, user_id, email, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!resetRow || resetRow.consumed_at || new Date(resetRow.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "invalid_or_expired" });
    }

    if (!password) return json({ ok: true, email: resetRow.email });
    if (password.length < 6) return json({ ok: false, error: "invalid_request" });

    const { error: updateError } = await admin.auth.admin.updateUserById(resetRow.user_id, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;

    const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const consumedIpHash = ipRaw ? await sha256Hex(ipRaw) : null;
    await admin
      .from("password_reset_links")
      .update({ consumed_at: new Date().toISOString(), consumed_ip_hash: consumedIpHash })
      .eq("id", resetRow.id)
      .is("consumed_at", null);

    await admin
      .from("org_users")
      .update({ status: "active", invite_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", resetRow.user_id)
      .eq("status", "invited")
      .is("invite_accepted_at", null);

    return json({ ok: true, email: resetRow.email });
  } catch (e) {
    console.error("complete-password-reset failed", (e as Error).message);
    return json({ ok: false, error: "reset_failed" });
  }
});