// Adds (or increments) an "Additional Client Site" line item on the user's
// active ACTV TRKR subscription. During the 14-day trial, Stripe does not
// charge for added items — the trial covers all items and the customer is
// billed (base plan + add-ons) only when the trial ends.
//
// Design choices:
//   * `proration_behavior: 'none'` — no surprise mid-cycle charge.
//   * If the additional-site item already exists on the subscription, we
//     just bump its `quantity` by 1; otherwise we add it as a new item.
//   * Requires the user to already have an active or trialing subscription.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADDITIONAL_SITE_PRICE_ID = "price_1TRrlOQXOqBVFUKWCbKtMtIC"; // $30/mo

const log = (step: string, details?: unknown) => {
  console.log(
    `[ADD-ADDITIONAL-SITE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`,
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) throw new Error(`Auth error: ${userErr.message}`);
    const user = userRes.user;
    if (!user?.email) throw new Error("User not authenticated");
    log("Authed", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "No Stripe customer found. Start your subscription before adding additional client sites.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }
    const customerId = customers.data[0].id;

    // Look for an active or trialing subscription
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const sub = subs.data.find(
      (s) => s.status === "trialing" || s.status === "active",
    );
    if (!sub) {
      return new Response(
        JSON.stringify({
          error:
            "No active subscription found. Start (or reactivate) your plan before adding additional client sites.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }
    log("Subscription found", { id: sub.id, status: sub.status });

    // Find existing additional-site item, if any
    const existing = sub.items.data.find(
      (item) => item.price.id === ADDITIONAL_SITE_PRICE_ID,
    );

    let updated;
    if (existing) {
      const newQty = (existing.quantity ?? 1) + 1;
      updated = await stripe.subscriptions.update(sub.id, {
        items: [{ id: existing.id, quantity: newQty }],
        proration_behavior: "none",
      });
      log("Incremented existing add-on", {
        itemId: existing.id,
        newQty,
      });
    } else {
      updated = await stripe.subscriptions.update(sub.id, {
        items: [{ price: ADDITIONAL_SITE_PRICE_ID, quantity: 1 }],
        proration_behavior: "none",
      });
      log("Added new additional-site item");
    }

    const additionalItem = updated.items.data.find(
      (item) => item.price.id === ADDITIONAL_SITE_PRICE_ID,
    );
    const additionalQty = additionalItem?.quantity ?? 0;

    return new Response(
      JSON.stringify({
        ok: true,
        subscription_id: updated.id,
        status: updated.status,
        is_trialing: updated.status === "trialing",
        additional_sites: additionalQty,
        trial_end: updated.trial_end,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
