import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  console.log(`[ACTV-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (webhookSecret && sig) {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body);
      logStep("WARNING: No webhook secret, parsing raw body");
    }
  } catch (err) {
    logStep("Signature verification failed", { error: String(err) });
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_email || session.customer_details?.email || "";
        const customerId = typeof session.customer === "string" ? session.customer : "";
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : "";
        const metadata = session.metadata || {};
        const plan = metadata.plan || "monthly";
        const mrr = plan === "annual" ? 27.5 : 30;

        const { error } = await supabase.from("subscribers").upsert({
          email,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan,
          status: "active",
          site_url: metadata.site_url || null,
          referral_source: metadata.referral_source || null,
          mrr,
          last_active_date: new Date().toISOString(),
        }, { onConflict: "stripe_customer_id" });

        if (error) logStep("DB insert error", { error });
        else logStep("Subscriber created", { email, plan });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : "";

        const { error } = await supabase
          .from("subscribers")
          .update({
            status: "churned",
            churn_date: new Date().toISOString(),
            churn_reason: sub.cancellation_details?.reason || "unknown",
            mrr: 0,
          })
          .eq("stripe_customer_id", customerId);

        if (error) logStep("Churn update error", { error });
        else logStep("Subscriber churned", { customerId });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : "";

        await supabase
          .from("subscribers")
          .update({ status: "past_due" })
          .eq("stripe_customer_id", customerId);

        await supabase.from("error_logs").insert({
          action: "payment_failed",
          error_message: `Invoice ${invoice.id} failed for customer ${customerId}`,
        });

        logStep("Payment failed recorded", { customerId });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }
  } catch (err) {
    logStep("Processing error", { error: String(err) });
    return new Response(JSON.stringify({ error: "Processing failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
