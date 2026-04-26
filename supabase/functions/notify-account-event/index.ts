// notify-account-event
// Public-but-authenticated wrapper around notify-auth-event. The browser
// can call this with the user's JWT to dispatch a security alert about
// THEIR OWN account. We resolve the userId from the JWT — clients cannot
// target another user.
//
// Allowed event types are restricted to those a logged-in user can
// legitimately trigger from the browser (e.g. confirming a password change).

import { createClient } from "npm:@supabase/supabase-js@2";
import { notifyAuthEvent, type AuthAlertEventType } from "../_shared/notify-auth-event.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED: AuthAlertEventType[] = ["password_changed"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const eventType = String(body?.eventType ?? "") as AuthAlertEventType;
    if (!ALLOWED.includes(eventType)) {
      return new Response(JSON.stringify({ error: "event_not_allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200) || null;

    await notifyAuthEvent({
      userId: userData.user.id,
      eventType,
      ip,
      userAgent: ua,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-account-event unexpected", (e as Error).message);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
