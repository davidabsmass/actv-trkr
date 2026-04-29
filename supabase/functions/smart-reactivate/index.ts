// smart-reactivate
//
// Tries to give the user the best path back to an active subscription:
//   1. If they have a Stripe customer record AND a recoverable subscription
//      (cancel_at_period_end, past_due, paused, or scheduled to cancel) →
//      open the Stripe Customer Portal so they can resume in-place.
//   2. Otherwise → open a fresh Stripe Checkout session for the standard plan.
//
// Returns: { url: string, mode: "portal" | "checkout" }

import { appCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Canonical monthly price (matches actv-checkout). Falls back to env override
// if you ever need to switch plans without redeploying.
const PRICE_ID =
  Deno.env.get("STRIPE_PRICE_ID") || "price_1TMlVgQXOqBVFUKWKU31SRaN";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  const json = (status: number, body: any) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    console.log("[smart-reactivate] start");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json(500, { error: "STRIPE_SECRET_KEY not configured" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return json(401, { error: "Not authenticated" });
    }
    const user = userData.user;
    console.log("[smart-reactivate] user", user.email);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://actvtrkr.com";

    // 1. Look up existing customer by email (so Checkout reuses payment methods).
    // We deliberately do NOT route through the Stripe Customer Portal here —
    // it requires extra Stripe configuration and has been a source of
    // "spinner forever" failures. A fresh Checkout always works and our
    // webhook restores the user's existing org to "active" on
    // subscription.created — no re-onboarding needed.
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    const customer = customers.data[0];

    // Fresh checkout for everyone. The webhook restores the user's
    // existing org to "active" on subscription.created — no re-onboarding.
    const session = await stripe.checkout.sessions.create({
      customer: customer?.id,
      customer_email: customer ? undefined : user.email!,
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${origin}/account?reactivated=1`,
      cancel_url: `${origin}/account`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      metadata: {
        user_id: user.id,
        flow: "reactivate",
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          flow: "reactivate",
        },
      },
    });
    return json(200, { url: session.url!, mode: "checkout" });
  } catch (e: any) {
    console.error("[smart-reactivate] error", e);
    return json(500, { error: e?.message || String(e) });
  }
});
