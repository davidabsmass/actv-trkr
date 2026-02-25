import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all clients
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, timezone");

    if (clientsError || !clients) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch clients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Record<string, any> = {};

    for (const client of clients) {
      const clientId = client.id;
      const tz = client.timezone || "America/New_York";

      // We aggregate yesterday by default
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];

      // Compute day boundaries in UTC (simplified — ideally use tz)
      const dayStart = `${dateStr}T00:00:00Z`;
      const dayEnd = `${dateStr}T23:59:59.999Z`;

      try {
        // --- TRAFFIC DAILY ---

        // pageviews_total
        const { count: pvCount } = await supabase
          .from("pageviews")
          .select("*", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd);

        await upsertTrafficDaily(supabase, clientId, dateStr, "pageviews_total", null, pvCount || 0);

        // sessions_total
        const { count: sessCount } = await supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd);

        await upsertTrafficDaily(supabase, clientId, dateStr, "sessions_total", null, sessCount || 0);

        // visitors_total (distinct visitor_id)
        const { data: visitors } = await supabase
          .from("pageviews")
          .select("visitor_id")
          .eq("client_id", clientId)
          .gte("occurred_at", dayStart)
          .lte("occurred_at", dayEnd)
          .not("visitor_id", "is", null);

        const uniqueVisitors = new Set(visitors?.map((v: any) => v.visitor_id) || []).size;
        await upsertTrafficDaily(supabase, clientId, dateStr, "visitors_total", null, uniqueVisitors);

        // sessions_by_source
        const { data: sessionsBySource } = await supabase
          .from("sessions")
          .select("utm_source, landing_referrer_domain")
          .eq("client_id", clientId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd);

        if (sessionsBySource) {
          const sourceCounts: Record<string, number> = {};
          for (const s of sessionsBySource) {
            const dim = s.utm_source || s.landing_referrer_domain || "direct";
            sourceCounts[dim] = (sourceCounts[dim] || 0) + 1;
          }
          for (const [dim, val] of Object.entries(sourceCounts)) {
            await upsertTrafficDaily(supabase, clientId, dateStr, "sessions_by_source", dim, val);
          }
        }

        // sessions_by_page
        const { data: sessionsByPage } = await supabase
          .from("sessions")
          .select("landing_page_path")
          .eq("client_id", clientId)
          .gte("started_at", dayStart)
          .lte("started_at", dayEnd);

        if (sessionsByPage) {
          const pageCounts: Record<string, number> = {};
          for (const s of sessionsByPage) {
            const dim = s.landing_page_path || "(unknown)";
            pageCounts[dim] = (pageCounts[dim] || 0) + 1;
          }
          for (const [dim, val] of Object.entries(pageCounts)) {
            await upsertTrafficDaily(supabase, clientId, dateStr, "sessions_by_page", dim, val);
          }
        }

        // --- KPI DAILY ---

        // leads_total
        const { count: leadsCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd);

        await upsertKpiDaily(supabase, clientId, dateStr, "leads_total", null, leadsCount || 0);

        // leads_by_source
        const { data: leadsBySource } = await supabase
          .from("leads")
          .select("utm_source")
          .eq("client_id", clientId)
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd);

        if (leadsBySource) {
          const lsCounts: Record<string, number> = {};
          for (const l of leadsBySource) {
            const dim = l.utm_source || "direct";
            lsCounts[dim] = (lsCounts[dim] || 0) + 1;
          }
          for (const [dim, val] of Object.entries(lsCounts)) {
            await upsertKpiDaily(supabase, clientId, dateStr, "leads_by_source", dim, val);
          }
        }

        // leads_by_page
        const { data: leadsByPage } = await supabase
          .from("leads")
          .select("page_path")
          .eq("client_id", clientId)
          .gte("submitted_at", dayStart)
          .lte("submitted_at", dayEnd);

        if (leadsByPage) {
          const lpCounts: Record<string, number> = {};
          for (const l of leadsByPage) {
            const dim = l.page_path || "(unknown)";
            lpCounts[dim] = (lpCounts[dim] || 0) + 1;
          }
          for (const [dim, val] of Object.entries(lpCounts)) {
            await upsertKpiDaily(supabase, clientId, dateStr, "leads_by_page", dim, val);
          }
        }

        results[clientId] = { status: "ok", date: dateStr };
      } catch (err) {
        console.error(`Aggregation error for client ${clientId}:`, err);
        results[clientId] = { status: "error", error: String(err) };
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Aggregation error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function upsertTrafficDaily(
  supabase: any, clientId: string, date: string,
  metric: string, dimension: string | null, value: number
) {
  // Check if exists
  let query = supabase
    .from("traffic_daily")
    .select("id")
    .eq("client_id", clientId)
    .eq("date", date)
    .eq("metric", metric);

  if (dimension === null) {
    query = query.is("dimension", null);
  } else {
    query = query.eq("dimension", dimension);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    await supabase
      .from("traffic_daily")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("traffic_daily").insert({
      client_id: clientId,
      date,
      metric,
      dimension,
      value,
    });
  }
}

async function upsertKpiDaily(
  supabase: any, clientId: string, date: string,
  metric: string, dimension: string | null, value: number
) {
  let query = supabase
    .from("kpi_daily")
    .select("id")
    .eq("client_id", clientId)
    .eq("date", date)
    .eq("metric", metric);

  if (dimension === null) {
    query = query.is("dimension", null);
  } else {
    query = query.eq("dimension", dimension);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    await supabase
      .from("kpi_daily")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("kpi_daily").insert({
      client_id: clientId,
      date,
      metric,
      dimension,
      value,
    });
  }
}
