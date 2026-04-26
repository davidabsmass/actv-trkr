// Admin-only: recalculates the `subscribers.mrr` column for every active
// subscriber by re-reading their Stripe subscription and applying any active
// discount/coupon (forever or repeating). Use this after fixing the MRR
// calculation logic, or whenever subscriber rows have drifted out of sync
// with Stripe (e.g. a coupon was applied directly in the Stripe dashboard).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { appCorsHeaders } from "../_shared/cors.ts";

const log = (step: string, details?: unknown) => {
  console.log(`[RECALC-MRR] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// Stripe API 2025+ moved discounts from `subscription.discount` (single object)
// to `subscription.discounts[]` (array). Support both.
function extractRecurringCoupon(sub: Stripe.Subscription): Stripe.Coupon | null {
  const discounts = (sub as any).discounts as Array<Stripe.Discount | string> | undefined;
  if (Array.isArray(discounts)) {
    for (const d of discounts) {
      if (typeof d === "string") continue;
      const c = d.coupon;
      if (c && (c.duration === "forever" || c.duration === "repeating")) return c;
    }
  }
  const legacy = (sub as any).discount as Stripe.Discount | null | undefined;
  if (legacy?.coupon) {
    const c = legacy.coupon;
    if (c.duration === "forever" || c.duration === "repeating") return c;
  }
  return null;
}

function computeMrrFromSubscription(sub: Stripe.Subscription): number {
  // Dead subscriptions contribute zero MRR
  if (sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid") {
    return 0;
  }

  const item = sub.items?.data?.[0];
  const price = item?.price;
  const unitAmount = price?.unit_amount || 0;
  const interval = price?.recurring?.interval;
  const intervalCount = price?.recurring?.interval_count || 1;

  let monthlyCents = unitAmount;
  if (interval === "year") monthlyCents = unitAmount / (12 * intervalCount);
  else if (interval === "week") monthlyCents = (unitAmount * 52) / (12 * intervalCount);
  else if (interval === "day") monthlyCents = (unitAmount * 365) / (12 * intervalCount);
  else if (interval === "month") monthlyCents = unitAmount / intervalCount;

  const coupon = extractRecurringCoupon(sub);
  if (coupon) {
    if (typeof coupon.percent_off === "number" && coupon.percent_off > 0) {
      monthlyCents = monthlyCents * (1 - coupon.percent_off / 100);
    } else if (typeof coupon.amount_off === "number" && coupon.amount_off > 0) {
      monthlyCents = Math.max(0, monthlyCents - coupon.amount_off);
    }
  }

  return Math.max(0, monthlyCents / 100);
}

serve(async (req) => {
  const corsHeaders = appCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate caller and verify they're an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Unauthorized");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles || []).some((r) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Pull every subscriber row that has a Stripe subscription
    const { data: subs, error: subsErr } = await supabase
      .from("subscribers")
      .select("id, email, status, stripe_subscription_id, stripe_customer_id, mrr")
      .not("stripe_subscription_id", "is", null);
    if (subsErr) throw subsErr;

    log("Subscribers to process", { count: subs?.length ?? 0 });

    const results: Array<{
      email: string;
      old_mrr: number;
      new_mrr: number;
      changed: boolean;
      reason?: string;
      discount?: string | null;
      sub_status?: string | null;
      error?: string;
    }> = [];

    for (const row of subs || []) {
      try {
        const oldMrr = Number(row.mrr || 0);

        // If the subscriber row is marked churned/paused, force MRR to 0 — they
        // aren't paying recurring revenue regardless of what Stripe says.
        if (row.status === "churned" || row.status === "canceled" || row.status === "paused") {
          const changed = Math.abs(0 - oldMrr) > 0.01;
          if (changed) {
            await supabase.from("subscribers").update({ mrr: 0 }).eq("id", row.id);
          }
          results.push({
            email: row.email,
            old_mrr: oldMrr,
            new_mrr: 0,
            changed,
            reason: `subscriber status=${row.status}`,
          });
          continue;
        }

        const stripeSub = await stripe.subscriptions.retrieve(row.stripe_subscription_id as string, {
          expand: ["discounts.coupon", "discount.coupon"],
        });
        const newMrr = computeMrrFromSubscription(stripeSub);
        const changed = Math.abs(newMrr - oldMrr) > 0.01;

        if (changed) {
          await supabase
            .from("subscribers")
            .update({ mrr: newMrr })
            .eq("id", row.id);
        }

        const coupon = extractRecurringCoupon(stripeSub);
        results.push({
          email: row.email,
          old_mrr: oldMrr,
          new_mrr: newMrr,
          changed,
          discount: coupon?.id ?? null,
          sub_status: stripeSub.status,
        });
      } catch (e) {
        results.push({
          email: row.email,
          old_mrr: Number(row.mrr || 0),
          new_mrr: Number(row.mrr || 0),
          changed: false,
          error: String(e),
        });
      }
    }

    const updated = results.filter((r) => r.changed).length;
    log("Done", { processed: results.length, updated });

    return new Response(
      JSON.stringify({
        processed: results.length,
        updated,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
