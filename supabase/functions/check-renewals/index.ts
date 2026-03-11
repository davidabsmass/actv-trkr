import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: renewals } = await supabase
      .from("renewals")
      .select("id, site_id, org_id, type, provider_name, renewal_date, is_enabled")
      .eq("is_enabled", true)
      .not("renewal_date", "is", null);

    if (!renewals || renewals.length === 0) {
      return new Response(JSON.stringify({ status: "ok", checked: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const alertThresholds = [30, 7, 5, 3, 1];
    let alertCount = 0;

    for (const r of renewals) {
      const renewDate = new Date(r.renewal_date);
      const daysUntil = Math.ceil((renewDate.getTime() - now.getTime()) / 86400000);

      if (alertThresholds.includes(daysUntil)) {
        await supabase.from("monitoring_alerts").insert({
          site_id: r.site_id,
          org_id: r.org_id,
          alert_type: "RENEWAL_DUE",
          severity: daysUntil <= 7 ? "critical" : "warning",
          subject: `${r.type} renewal due: ${r.provider_name || "Unknown"}`,
          message: `${r.type} renewal is due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}.`,
        });
        alertCount++;
      }
    }

    return new Response(JSON.stringify({ status: "ok", checked: renewals.length, alerts: alertCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Renewal check error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
