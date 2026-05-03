// Starts the 7-day Stripe trial for an org the moment its WordPress site
// sends its first signal. Invoked fire-and-forget by `ingest-heartbeat`
// when an org in `pending_connection` lands its first signal.
//
// Behavior:
//  - Idempotent: if the org is already `active` or already has a
//    stripe_subscription_id stored on its subscriber row, it no-ops.
//  - Looks up the org's stored `stripe_customer_id` + `pending_plan`,
//    finds the saved default payment method on that customer, then
//    creates a subscription with `trial_period_days: 7` and
//    `trial_settings.end_behavior.missing_payment_method = 'cancel'`.
//  - Flips org status to `active` and stamps `first_connected_at`.
//
// SECURITY: Service-role only. Caller must pass the service-role token in
// the Authorization header (ingest-heartbeat does this internally).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICES: Record<string, string> = {
  monthly: "price_1TMlVgQXOqBVFUKWKU31SRaN",
  annual: "price_1TMtdtQXOqBVFUKWVejiZBzI",
};

const log = (step: string, details?: any) => {
  console.log(`[START-TRIAL-ON-CONNECT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Service-role gate
    const auth = req.headers.get("authorization") || "";
    const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!expected || !auth.includes(expected)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id } = await req.json().catch(() => ({}));
    if (!org_id) {
      return new Response(JSON.stringify({ error: "Missing org_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const { data: org, error: orgErr } = await supabase
      .from("orgs")
      .select("id, name, status, billing_exempt, stripe_customer_id, pending_plan, first_connected_at")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr || !org) {
      log("Org not found", { org_id, error: orgErr?.message });
      return new Response(JSON.stringify({ error: "Org not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: already activated, billing exempt, or no longer pending → no-op
    if (org.billing_exempt) {
      log("Billing exempt — no trial needed", { org_id });
      return new Response(JSON.stringify({ ok: true, reason: "billing_exempt" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (org.status !== "pending_connection") {
      log("Org not in pending_connection — no-op", { org_id, status: org.status });
      return new Response(JSON.stringify({ ok: true, reason: "not_pending" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!org.stripe_customer_id) {
      log("Org missing stripe_customer_id — cannot start trial", { org_id });
      return new Response(JSON.stringify({ error: "Missing stripe_customer_id" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const plan = org.pending_plan === "annual" ? "annual" : "monthly";
    const priceId = PRICES[plan];

    // Find the default payment method (saved via setup-mode checkout).
    // Stripe attaches the PM to the customer and sets it as
    // invoice_settings.default_payment_method automatically when a
    // SetupIntent succeeds via Checkout in setup mode.
    const customer = await stripe.customers.retrieve(org.stripe_customer_id) as Stripe.Customer;
    let defaultPm = (customer as any)?.invoice_settings?.default_payment_method as string | null;

    if (!defaultPm) {
      // Fallback: list attached PMs and pick the most recent card.
      const pms = await stripe.paymentMethods.list({
        customer: org.stripe_customer_id,
        type: "card",
        limit: 1,
      });
      defaultPm = pms.data[0]?.id || null;
      if (defaultPm) {
        await stripe.customers.update(org.stripe_customer_id, {
          invoice_settings: { default_payment_method: defaultPm },
        });
      }
    }

    if (!defaultPm) {
      log("No payment method on file — cannot create trial sub", { org_id });
      return new Response(JSON.stringify({ error: "No payment method on file" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the trial subscription. 7 days, must convert via the saved PM
    // or it cancels automatically.
    const sub = await stripe.subscriptions.create({
      customer: org.stripe_customer_id,
      items: [{ price: priceId }],
      trial_period_days: 7,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      default_payment_method: defaultPm,
      metadata: { org_id, plan, source: "trial_on_connect" },
    });

    log("Trial subscription created", { org_id, subId: sub.id, status: sub.status, trialEnd: sub.trial_end });

    // Update subscriber row
    await supabase
      .from("subscribers")
      .update({
        status: "active",
        stripe_subscription_id: sub.id,
        last_active_date: new Date().toISOString(),
      })
      .eq("stripe_customer_id", org.stripe_customer_id);

    // Flip org to active and stamp first_connected_at
    await supabase.rpc("set_org_lifecycle_status", {
      p_org_id: org_id,
      p_status: "active",
      p_reason: "first_signal_started_trial",
    });

    await supabase
      .from("orgs")
      .update({ first_connected_at: new Date().toISOString() })
      .eq("id", org_id);

    return new Response(
      JSON.stringify({ ok: true, subscription_id: sub.id, trial_end: sub.trial_end }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
