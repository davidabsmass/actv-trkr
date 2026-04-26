import { appCorsHeaders } from '../_shared/cors.ts'
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

const logStep = (step: string, details?: any) => {
  console.log(`[CHECK-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { data: memberships } = await supabaseClient
      .from("org_users")
      .select("org_id")
      .eq("user_id", user.id);

    const orgIds = (memberships ?? []).map((row) => row.org_id);
    const { data: subscriptionRows } = orgIds.length
      ? await supabaseClient
          .from("subscription_status")
          .select("status")
          .in("org_id", orgIds)
      : { data: [] as Array<{ status: string }> };

    const { data: subscriberRows } = await supabaseClient
      .from("subscribers")
      .select("status")
      .ilike("email", user.email);
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    const derivedStatus = [
      ...(subscriptionRows ?? []).map((row) => row.status),
      ...(subscriberRows ?? []).map((row) => row.status),
    ].find((status) => ["cancelled", "canceled", "churned", "past_due"].includes(String(status).toLowerCase())) ?? null;

    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(JSON.stringify({
        subscribed: false,
        subscription_status: derivedStatus,
        should_force_logout: ["cancelled", "canceled", "churned"].includes(String(derivedStatus).toLowerCase()),
      }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let productId = null;
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      const item = subscription.items.data[0];
      // In newer Stripe API versions, current_period_end lives on the subscription item, not the subscription itself.
      const periodEndUnix =
        (item as any)?.current_period_end ??
        (subscription as any)?.current_period_end ??
        null;
      subscriptionEnd =
        typeof periodEndUnix === "number" && Number.isFinite(periodEndUnix)
          ? new Date(periodEndUnix * 1000).toISOString()
          : null;
      productId = item?.price?.product ?? null;
      logStep("Active subscription found", { subscriptionEnd, productId });
    } else {
      logStep("No active subscription");
    }

    const subscriptionStatus = hasActiveSub ? "active" : derivedStatus;

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
      subscription_status: subscriptionStatus,
      should_force_logout: !hasActiveSub && ["cancelled", "canceled", "churned"].includes(String(subscriptionStatus).toLowerCase()),
    }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      status: 200,
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
