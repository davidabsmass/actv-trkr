import { createClient } from "npm:@supabase/supabase-js@2";
import { observe } from "../_shared/observability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const apiKey = req.headers.get("x-api-key") || body.api_key;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing api_key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify API key
    const keyHash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(apiKey))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      );

    const { data: keyRow } = await supabase
      .from("api_keys")
      .select("org_id")
      .eq("key_hash", keyHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!keyRow) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = keyRow.org_id;
    const domain = (body.domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./i, "").toLowerCase();

    // Resolve site_id
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", orgId)
      .ilike("domain", `%${domain}%`)
      .maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const siteId = site.id;
    const order = body.order;

    if (!order || !order.order_id) {
      return new Response(JSON.stringify({ error: "Missing order data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve attribution from session if available
    let attribution: Record<string, string | null> = {
      utm_source: null, utm_medium: null, utm_campaign: null,
      landing_page: null, referrer_domain: null,
    };

    if (order.session_id) {
      const { data: sess } = await supabase
        .from("sessions")
        .select("utm_source, utm_medium, utm_campaign, landing_page_path, landing_referrer_domain")
        .eq("org_id", orgId)
        .eq("session_id", order.session_id)
        .maybeSingle();

      if (sess) {
        attribution = {
          utm_source: sess.utm_source,
          utm_medium: sess.utm_medium,
          utm_campaign: sess.utm_campaign,
          landing_page: sess.landing_page_path,
          referrer_domain: sess.landing_referrer_domain,
        };
      }
    }

    // Upsert order
    // H-5 fix: never persist raw customer_email or customer_name. Older plugin
    // versions may still send them; we drop them server-side and only keep the
    // salted hash for de-duplication.
    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .upsert(
        {
          org_id: orgId,
          site_id: siteId,
          external_order_id: String(order.order_id),
          status: order.status || "completed",
          total: Number(order.total) || 0,
          currency: order.currency || "USD",
          payment_method: order.payment_method || null,
          customer_email: null,
          customer_name: null,
          customer_email_hash: order.customer_email_hash || null,
          visitor_id: order.visitor_id || null,
          session_id: order.session_id || null,
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          landing_page: attribution.landing_page,
          referrer_domain: attribution.referrer_domain,
          ordered_at: order.ordered_at || new Date().toISOString(),
        },
        { onConflict: "org_id,site_id,external_order_id" }
      )
      .select("id")
      .single();

    if (orderErr) throw orderErr;

    // Insert line items
    const items = order.items || [];
    if (items.length > 0 && orderRow) {
      // Delete existing items for idempotent upsert
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderRow.id);

      const rows = items.map((item: any) => ({
        order_id: orderRow.id,
        org_id: orgId,
        product_name: item.product_name || "Unknown",
        product_id: item.product_id ? String(item.product_id) : null,
        sku: item.sku || null,
        quantity: Number(item.quantity) || 1,
        line_total: Number(item.line_total) || 0,
      }));

      const { error: itemErr } = await supabase
        .from("order_items")
        .insert(rows);

      if (itemErr) console.error("Item insert error:", itemErr);
    }

    return new Response(JSON.stringify({ ok: true, order_id: orderRow?.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ingest-order error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
