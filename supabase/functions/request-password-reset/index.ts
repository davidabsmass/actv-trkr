// request-password-reset
// Server-side wrapper around Supabase's resetPasswordForEmail that enforces:
//   - Rate limiting via public.check_password_reset_rate_limit (3 / hour / email)
//   - Logging into auth_password_reset_log
//   - Security alert email to the account owner
//
// Always returns 200 to avoid leaking which addresses exist (timing-safe).

import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyAuthEvent } from "../_shared/notify-auth-event.ts";
import { createPasswordResetUrl, resolveUserIdByEmail, sha256Hex } from "../_shared/password-reset-links.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    // Generate our own one-use reset link so email scanners cannot consume it.
    try {
      const userId = await resolveUserIdByEmail(admin, email);
      const resetUrl = await createPasswordResetUrl(admin, email, redirectTo || "https://actvtrkr.com/reset-password", userId);
      if (!resetUrl) throw new Error("No matching account for reset request");
      const { error: emailError } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "password-reset",
          recipientEmail: email,
          idempotencyKey: `password-reset-${email}-${Date.now()}`,
          templateData: { resetUrl },
        },
      });
      if (emailError) throw emailError;
    } catch (e) {
      console.error("password reset email failed", (e as Error).message);
    }

    // Look up user (if exists) so we can send the security alert email.
    try {
      const userId = await resolveUserIdByEmail(admin, email);
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
