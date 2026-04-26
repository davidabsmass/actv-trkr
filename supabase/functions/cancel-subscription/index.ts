import { appCorsHeaders } from '../_shared/cors.ts'
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

const logStep = (step: string, details?: any) => {
  console.log(`[CANCEL-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) throw new Error("No Stripe customer found");
    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Get all active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
    });

    if (subscriptions.data.length === 0) {
      logStep("No active subscriptions to cancel");
      return new Response(JSON.stringify({ success: true, message: "No active subscriptions" }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Cancel all active subscriptions immediately
    for (const sub of subscriptions.data) {
      logStep("Cancelling subscription", { id: sub.id });
      await stripe.subscriptions.cancel(sub.id);
    }
    logStep("All subscriptions cancelled", { count: subscriptions.data.length });

    // Update subscriber status to churned immediately (don't wait for webhook)
    const { error: updateError } = await supabase
      .from("subscribers")
      .update({
        status: "churned",
        churn_date: new Date().toISOString(),
        churn_reason: "user_cancelled",
        mrr: 0,
      })
      .eq("stripe_customer_id", customerId);

    if (updateError) {
      logStep("Failed to update subscriber status", { error: updateError });
    } else {
      logStep("Subscriber marked as churned");
    }

    // Also update subscription_status table
    // Find org via subscriber email
    const { data: subscriber } = await supabase
      .from("subscribers")
      .select("id, email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (subscriber?.email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", subscriber.email)
        .maybeSingle();

      if (profile?.user_id) {
        const { data: orgUser } = await supabase
          .from("org_users")
          .select("org_id")
          .eq("user_id", profile.user_id)
          .maybeSingle();

        if (orgUser?.org_id) {
          await supabase
            .from("subscription_status")
            .update({
              status: "cancelled",
              canceled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("org_id", orgUser.org_id);
          logStep("subscription_status updated", { org_id: orgUser.org_id });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, cancelled_count: subscriptions.data.length }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
