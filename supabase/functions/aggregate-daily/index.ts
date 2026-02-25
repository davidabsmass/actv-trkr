import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: orgs } = await supabase.from("orgs").select("id, timezone");
    if (!orgs) return new Response(JSON.stringify({ error: "No orgs" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const results: Record<string, any> = {};

    for (const org of orgs) {
      const orgId = org.id;
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];
      const dayStart = `${dateStr}T00:00:00Z`, dayEnd = `${dateStr}T23:59:59.999Z`;

      try {
        // pageviews_total
        const { count: pvCount } = await supabase.from("pageviews").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd);
        await upsert(supabase, "traffic_daily", orgId, dateStr, "pageviews_total", null, pvCount || 0);

        // sessions_total
        const { count: sessCount } = await supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
        await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_total", null, sessCount || 0);

        // visitors_total
        const { data: visitors } = await supabase.from("pageviews").select("visitor_id").eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd).not("visitor_id", "is", null);
        await upsert(supabase, "traffic_daily", orgId, dateStr, "visitors_total", null, new Set(visitors?.map((v: any) => v.visitor_id)).size);

        // sessions_by_source
        const { data: sbs } = await supabase.from("sessions").select("utm_source, landing_referrer_domain").eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
        if (sbs) { const m: Record<string, number> = {}; sbs.forEach((s: any) => { const d = s.utm_source || s.landing_referrer_domain || "direct"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_source", d, v); }

        // sessions_by_page
        const { data: sbp } = await supabase.from("sessions").select("landing_page_path").eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
        if (sbp) { const m: Record<string, number> = {}; sbp.forEach((s: any) => { const d = s.landing_page_path || "(unknown)"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_page", d, v); }

        // leads_total
        const { count: leadsCount } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
        await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_total", null, leadsCount || 0);

        // leads_by_source
        const { data: lbs } = await supabase.from("leads").select("source").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
        if (lbs) { const m: Record<string, number> = {}; lbs.forEach((l: any) => { const d = l.source || "direct"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_by_source", d, v); }

        // leads_by_page
        const { data: lbp } = await supabase.from("leads").select("page_path").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
        if (lbp) { const m: Record<string, number> = {}; lbp.forEach((l: any) => { const d = l.page_path || "(unknown)"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_by_page", d, v); }

        results[orgId] = { status: "ok", date: dateStr };
      } catch (err) { console.error(`Agg error ${orgId}:`, err); results[orgId] = { status: "error" }; }
    }

    return new Response(JSON.stringify({ results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Aggregation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function upsert(supabase: any, table: string, orgId: string, date: string, metric: string, dimension: string | null, value: number) {
  let q = supabase.from(table).select("id").eq("org_id", orgId).eq("date", date).eq("metric", metric);
  q = dimension === null ? q.is("dimension", null) : q.eq("dimension", dimension);
  const { data: existing } = await q.maybeSingle();
  if (existing) await supabase.from(table).update({ value }).eq("id", existing.id);
  else await supabase.from(table).insert({ org_id: orgId, date, metric, dimension, value });
}
