// cancellation-feedback
// Stores reason/outcome from the cancel-save modal, then optionally cancels the subscription.
// Called by the dashboard when a user starts the cancellation flow.

import { appCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const log = (s: string, d?: unknown) => console.log(`[CANCEL-FEEDBACK] ${s}${d !== undefined ? ` ${JSON.stringify(d)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("No authorization header");
    const { data: userData, error: uErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !userData.user) throw new Error("Auth failed");
    const user = userData.user;

    const body = await req.json();
    const { org_id, reason, reason_detail, selected_offer, outcome } = body as {
      org_id: string;
      reason: string;
      reason_detail?: string;
      selected_offer?: string;
      outcome: "saved" | "paused" | "downgraded" | "canceled" | "abandoned";
    };

    if (!org_id || !reason || !outcome) throw new Error("Missing required fields");

    // Verify user belongs to org
    const { data: membership } = await supabase
      .from("org_users")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) throw new Error("Not a member of this org");

    // Resolve subscriber
    const { data: subscriber } = await supabase
      .from("subscribers")
      .select("id, stripe_subscription_id")
      .ilike("email", user.email!)
      .maybeSingle();

    const { data: row, error: insErr } = await supabase
      .from("cancellation_feedback")
      .insert({
        org_id,
        customer_id: subscriber?.id ?? null,
        user_id: user.id,
        subscription_id: subscriber?.stripe_subscription_id ?? null,
        reason,
        reason_detail: reason_detail ?? null,
        selected_offer: selected_offer ?? null,
        outcome,
      })
      .select("id")
      .single();

    if (insErr) throw insErr;

    log("recorded", { org_id, reason, outcome, id: row.id });

    return new Response(JSON.stringify({ ok: true, id: row.id }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
