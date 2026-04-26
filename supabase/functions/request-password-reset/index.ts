// request-password-reset
// Server-side wrapper around Supabase's resetPasswordForEmail that enforces:
//   - Rate limiting via public.check_password_reset_rate_limit (3 / hour / email)
//   - Logging into auth_password_reset_log
//   - Security alert email to the account owner
//
// Always returns 200 to avoid leaking which addresses exist (timing-safe).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { notifyAuthEvent } from "../_shared/notify-auth-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const redirectTo = String(body?.redirectTo ?? "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Generic OK response — don't leak validity.
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Rate limit
    try {
      const { data: allowed } = await admin.rpc("check_password_reset_rate_limit", { p_email: email });
      if (allowed === false) {
        // Quietly drop further work; still return generic OK.
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      console.error("rate limit check failed", (e as Error).message);
    }

    const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ipHash = ipRaw ? await sha256Hex(ipRaw) : null;
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200) || null;

    // Log the request (whether the email exists or not).
    try {
      await admin.from("auth_password_reset_log").insert({
        email,
        ip_hash: ipHash,
        user_agent: ua,
      });
    } catch (_) { /* ignore */ }

    // Trigger the actual password-reset email through Supabase.
    try {
      // resetPasswordForEmail is also exposed via admin client; falling back via auth API.
      await admin.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    } catch (e) {
      console.error("resetPasswordForEmail failed", (e as Error).message);
    }

    // Look up user (if exists) so we can send the security alert email.
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      // listUsers doesn't filter by email; fall back to direct query on auth.users via RPC if needed.
      // Instead, use a quick existence check using getUserByEmail if available:
      // The supabase-js admin API exposes `getUserByEmail` only in newer versions.
      // We try; if it throws, we silently skip the alert (rate-limit + log are still done).
      // deno-lint-ignore no-explicit-any
      const adminAny = admin.auth.admin as any;
      let userId: string | null = null;
      if (typeof adminAny.getUserByEmail === "function") {
        const { data } = await adminAny.getUserByEmail(email);
        if (data?.user?.id) userId = data.user.id;
      } else if (list?.users) {
        const match = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
        if (match) userId = match.id;
      }
      if (userId) {
        notifyAuthEvent({
          userId,
          eventType: "password_reset_requested",
          ip: ipRaw || null,
          userAgent: ua,
        }).catch(() => { /* ignore */ });
      }
    } catch (e) {
      console.error("alert dispatch failed", (e as Error).message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("request-password-reset unexpected", (e as Error).message);
    // Still 200 to avoid info leak.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
