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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://actvtrkr.com";

    // 1. Look up existing customer by email
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    const customer = customers.data[0];

    // 2. If customer exists, check for recoverable subscription
    if (customer) {
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 5,
      });
      // Only the portal can RESUME these states. Fully canceled / unpaid
      // subscriptions cannot be revived via the portal — those need a fresh
      // checkout (handled below).
      const recoverable = subs.data.find(
        (s: any) =>
          s.cancel_at_period_end === true ||
          s.status === "past_due" ||
          s.status === "paused"
      );

      if (recoverable) {
        const portal = await stripe.billingPortal.sessions.create({
          customer: customer.id,
          return_url: `${origin}/account?reactivated=1`,
        });
        return json(200, { url: portal.url, mode: "portal" });
      }
    }

    // 3. Fall back to fresh checkout
    if (!PRICE_ID) {
      return json(500, {
        error: "STRIPE_PRICE_ID not configured — cannot start fresh checkout",
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer?.id,
      customer_email: customer ? undefined : user.email!,
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${origin}/account?reactivated=1`,
      cancel_url: `${origin}/account`,
      allow_promotion_codes: true,
    });
    return json(200, { url: session.url!, mode: "checkout" });
  } catch (e: any) {
    console.error("[smart-reactivate] error", e);
    return json(500, { error: e?.message || String(e) });
  }
});
