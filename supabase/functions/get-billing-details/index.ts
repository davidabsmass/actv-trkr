import { appCorsHeaders } from '../_shared/cors.ts'
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: appCorsHeaders(req) });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({
        has_customer: false,
        subscription: null,
        payment_method: null,
        invoices: [],
      }), {
        headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customer = customers.data[0];
    const customerId = customer.id;

    // Subscriptions (any status)
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
      expand: ["data.items.data.price.product", "data.default_payment_method"],
    });

    // Pick the active/trialing one preferentially, else most recent
    const orderedSubs = [...subs.data].sort((a, b) => {
      const score = (s: Stripe.Subscription) => {
        if (s.status === "active" || s.status === "trialing") return 3;
        if (s.status === "past_due") return 2;
        if (s.status === "canceled") return 1;
        return 0;
      };
      return score(b) - score(a) || (b.created - a.created);
    });
    const sub = orderedSubs[0] ?? null;

    let subscription: any = null;
    if (sub) {
      const item = sub.items.data[0];
      const price = item?.price;
      const product = price?.product as Stripe.Product | undefined;
      const periodEndUnix =
        (item as any)?.current_period_end ??
        (sub as any)?.current_period_end ??
        null;
      subscription = {
        id: sub.id,
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end,
        current_period_end: typeof periodEndUnix === "number"
          ? new Date(periodEndUnix * 1000).toISOString()
          : null,
        cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval: price?.recurring?.interval ?? null,
        product_name: typeof product === "object" && product?.name ? product.name : null,
      };
    }

    // Default payment method
    let payment_method: any = null;
    let pmId: string | null = null;
    if (sub?.default_payment_method) {
      pmId = typeof sub.default_payment_method === "string"
        ? sub.default_payment_method
        : sub.default_payment_method.id;
    } else if (customer.invoice_settings?.default_payment_method) {
      pmId = typeof customer.invoice_settings.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings.default_payment_method.id;
    }
    if (pmId) {
      try {
        const pm = await stripe.paymentMethods.retrieve(pmId);
        if (pm.type === "card" && pm.card) {
          payment_method = {
            type: "card",
            brand: pm.card.brand,
            last4: pm.card.last4,
            exp_month: pm.card.exp_month,
            exp_year: pm.card.exp_year,
          };
        } else {
          payment_method = { type: pm.type };
        }
      } catch (_) { /* ignore */ }
    }

    // Invoices (last 12)
    const invoiceList = await stripe.invoices.list({
      customer: customerId,
      limit: 12,
    });
    const invoices = invoiceList.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      created: new Date(inv.created * 1000).toISOString(),
      amount_paid: inv.amount_paid,
      amount_due: inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
    }));

    return new Response(JSON.stringify({
      has_customer: true,
      subscription,
      payment_method,
      invoices,
    }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[get-billing-details]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
