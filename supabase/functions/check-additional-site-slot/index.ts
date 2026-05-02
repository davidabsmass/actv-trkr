// Read-only sibling of `add-additional-site`. Returns the same slot accounting
// but never mutates Stripe. The Add Site modal calls this BEFORE deciding
// whether to show a "Confirm — we'll add a $30/mo line item" screen, so users
// who already have a paid-but-unconnected slot (e.g. from a direct Stripe
// quantity bump) skip straight to the download page.
//
// Contract:
//   200 OK
//   {
//     purchased_slots:  number, // current additional-site quantity in Stripe
//     connected_sites:  number, // sites with a heartbeat in this org
//     used_slots:       number, // max(0, connected_sites - 1)
//     available_slots:  number, // purchased_slots - used_slots (>=0 means already paid)
//     is_trialing:      boolean,
//     has_subscription: boolean
//   }
//
// On any failure we return has_subscription=false and zeros — the modal
// falls back to the normal confirm flow, so we never block the user.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADDITIONAL_SITE_PRICE_ID = "price_1TRrlOQXOqBVFUKWCbKtMtIC";

const log = (step: string, details?: unknown) => {
  console.log(
    `[CHECK-ADDITIONAL-SITE-SLOT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`,
  );
};

const empty = (extra: Record<string, unknown> = {}) => ({
  purchased_slots: 0,
  connected_sites: 0,
  used_slots: 0,
  available_slots: 0,
  is_trialing: false,
  has_subscription: false,
  ...extra,
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) throw new Error(`Auth error: ${userErr.message}`);
    const user = userRes.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { data: orgRows, error: orgErr } = await supabase
      .from("org_users")
      .select("org_id, role")
      .eq("user_id", user.id);
    if (orgErr) throw new Error(`org_users lookup failed: ${orgErr.message}`);
    const org = orgRows?.find((r) => r.role === "admin") ?? orgRows?.[0];
    if (!org) {
      log("No org for user");
      return new Response(JSON.stringify(empty()), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const orgId = org.org_id as string;

    const { count: connectedSites, error: sitesErr } = await supabase
      .from("sites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .not("last_heartbeat_at", "is", null);
    if (sitesErr) throw new Error(`sites count failed: ${sitesErr.message}`);
    const connectedCount = connectedSites ?? 0;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify(empty({ connected_sites: connectedCount })),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }
    const customerId = customers.data[0].id;

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
        JSON.stringify(empty({ connected_sites: connectedCount })),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const existing = sub.items.data.find(
      (item) => item.price.id === ADDITIONAL_SITE_PRICE_ID,
    );
    const purchasedSlots = existing?.quantity ?? 0;
    const usedSlots = Math.max(0, connectedCount - 1);
    const availableSlots = Math.max(0, purchasedSlots - usedSlots);

    log("Slot accounting", {
      purchasedSlots,
      connectedCount,
      usedSlots,
      availableSlots,
    });

    return new Response(
      JSON.stringify({
        purchased_slots: purchasedSlots,
        connected_sites: connectedCount,
        used_slots: usedSlots,
        available_slots: availableSlots,
        is_trialing: sub.status === "trialing",
        has_subscription: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    // Soft-fail: caller should fall back to the confirm flow.
    return new Response(JSON.stringify(empty({ error: msg })), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
