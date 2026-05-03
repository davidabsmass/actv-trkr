import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const ALLOWED_ORIGINS = [
  "https://actvtrkr.com",
  "https://www.actvtrkr.com",
  "https://mshnctrl.lovable.app",
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow Lovable preview origins
  if (origin.includes("lovableproject.com") || origin.includes("lovable.app")) return origin;
  return ALLOWED_ORIGINS[0]; // safe fallback
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICES = {
  monthly: "price_1TMlVgQXOqBVFUKWKU31SRaN",
  annual: "price_1TMtdtQXOqBVFUKWVejiZBzI",
};

const logStep = (step: string, details?: any) => {
  console.log(`[ACTV-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const { email, plan, site_url, referral_source } = await req.json();

    // email is optional — Stripe Checkout will collect it if not provided

    const selectedPlan = plan === "annual" ? "annual" : "monthly";
    const priceId = PRICES[selectedPlan];
    logStep("Plan selected", { plan: selectedPlan, priceId });

    // Check for existing customer only if email provided
    let customerId: string | undefined;
    if (email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Existing customer found", { customerId });
      }
    }

    const origin = getAllowedOrigin(req);

    const metadata: Record<string, string> = { plan: selectedPlan };
    if (site_url) metadata.site_url = site_url;
    if (referral_source) metadata.referral_source = referral_source;

    // Setup-mode checkout: collect & save a payment method, but do NOT create
    // a subscription or charge anything. The Stripe subscription (with a 7-day
    // trial) is only created when the user's WordPress site sends its first
    // signal — see `start-trial-on-connect` invoked from `ingest-heartbeat`.
    //
    // We attach pending_plan + pending_price to metadata so the trial-creation
    // step knows which price to subscribe to.
    const setupMetadata: Record<string, string> = {
      ...metadata,
      pending_price: priceId,
      pending_plan: selectedPlan,
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : (email || undefined),
      mode: "setup",
      metadata: setupMetadata,
      // Persist the saved card on the customer + carry our metadata onto the
      // SetupIntent so the webhook handler can read it.
      setup_intent_data: {
        metadata: setupMetadata,
      },
      payment_method_types: ["card"],
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
    });

    logStep("Session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
