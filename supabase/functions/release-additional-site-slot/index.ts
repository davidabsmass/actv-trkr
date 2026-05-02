// Releases ONE unused "Additional Client Site" slot from the user's
// subscription — companion to add-additional-site.
//
// Rules:
//   - Only allows release when there's actually an unused slot
//     (purchased > used). Prevents accidentally cancelling sites that
//     are actively reporting.
//   - Uses `proration_behavior: 'create_prorations'` so the customer
//     gets credit on their next invoice for the unused portion.
//   - Also revokes the most recently created, unused (no site_id),
//     non-revoked "Additional site key" row for this org so we don't
//     leave dangling keys behind.

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
    `[RELEASE-SLOT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`,
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
    if (!org) throw new Error("No organization found for this user");
    const orgId = org.org_id as string;

    const { count: connectedSites } = await supabase
      .from("sites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .not("last_heartbeat_at", "is", null);
    const connectedCount = connectedSites ?? 0;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer found." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
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
        JSON.stringify({ error: "No active subscription found." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const existing = sub.items.data.find(
      (item) => item.price.id === ADDITIONAL_SITE_PRICE_ID,
    );
    if (!existing || (existing.quantity ?? 0) === 0) {
      return new Response(
        JSON.stringify({
          error: "no_slots",
          message: "No additional site slots to release.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const purchasedSlots = existing.quantity ?? 0;
    const usedSlots = Math.max(0, connectedCount - 1);
    const availableSlots = purchasedSlots - usedSlots;

    if (availableSlots <= 0) {
      return new Response(
        JSON.stringify({
          error: "no_unused_slots",
          message:
            "All your purchased slots are in use by connected sites. Disconnect a site in WordPress before releasing the slot.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        },
      );
    }

    const newQty = purchasedSlots - 1;
    log("Releasing slot", { purchasedSlots, newQty });

    let updated;
    if (newQty <= 0) {
      // Remove the line item entirely.
      updated = await stripe.subscriptions.update(sub.id, {
        items: [{ id: existing.id, deleted: true }],
        proration_behavior: "create_prorations",
      });
    } else {
      updated = await stripe.subscriptions.update(sub.id, {
        items: [{ id: existing.id, quantity: newQty }],
        proration_behavior: "create_prorations",
      });
    }

    // Best-effort: revoke the most recent unused "Additional site key" row.
    const { data: orphanKeys } = await supabase
      .from("api_keys")
      .select("id, created_at")
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .is("site_id", null)
      .ilike("label", "%additional%")
      .order("created_at", { ascending: false })
      .limit(1);

    if (orphanKeys && orphanKeys.length > 0) {
      await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", orphanKeys[0].id);
      log("Revoked orphan key", { keyId: orphanKeys[0].id });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        new_quantity: newQty,
        subscription_status: updated.status,
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
