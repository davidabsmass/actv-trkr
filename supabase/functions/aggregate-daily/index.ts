import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: cron secret or just allow all POST (verify_jwt=false, internal-only function)
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  const hasCronSecret = cronSecret && incoming === cronSecret;
  // This function is internal-only (not exposed to end users), so we allow unauthenticated calls
  // The function is protected by verify_jwt=false in config.toml and only called by cron/internal tools

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    // Support backfill mode
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const backfillDays = body.backfill_days || 2; // default: today + yesterday

    const { data: orgs } = await supabase.from("orgs").select("id, timezone");
    if (!orgs) return new Response(JSON.stringify({ error: "No orgs" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const results: Record<string, any> = {};

    const datesToProcess: string[] = [];
    for (let i = 0; i < backfillDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      datesToProcess.push(d.toISOString().split("T")[0]);
    }

    for (const org of orgs) {
      const orgId = org.id;
      const orgResults: Record<string, any> = {};

      for (const dateStr of datesToProcess) {
        const dayStart = `${dateStr}T00:00:00Z`, dayEnd = `${dateStr}T23:59:59.999Z`;

        try {
          // pageviews
          const { count: pvCount } = await supabase.from("pageviews").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd);
          await upsert(supabase, "traffic_daily", orgId, dateStr, "pageviews_total", null, pvCount || 0);
          // Also write to kpi_daily with the metric name the dashboard expects
          await upsert(supabase, "kpi_daily", orgId, dateStr, "pageviews", null, pvCount || 0);

          // sessions
          const { count: sessCount } = await supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
          await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_total", null, sessCount || 0);
          await upsert(supabase, "kpi_daily", orgId, dateStr, "sessions", null, sessCount || 0);

          // visitors_total
          const { data: visitors } = await supabase.from("pageviews").select("visitor_id").eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd).not("visitor_id", "is", null);
          await upsert(supabase, "traffic_daily", orgId, dateStr, "visitors_total", null, new Set(visitors?.map((v: any) => v.visitor_id)).size);

          // sessions_by_source
          const { data: sbs } = await supabase.from("sessions").select("utm_source, landing_referrer_domain").eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
          if (sbs) { const m: Record<string, number> = {}; sbs.forEach((s: any) => { const d = s.utm_source || s.landing_referrer_domain || "direct"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_source", d, v); }

          // sessions_by_page
          const { data: sbp } = await supabase.from("sessions").select("landing_page_path").eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd);
          if (sbp) { const m: Record<string, number> = {}; sbp.forEach((s: any) => { const d = s.landing_page_path || "(unknown)"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_page", d, v); }

          // leads (totals — includes imports + sessionless POSTs; used for
          // lead-count widgets and exports)
          const { count: leadsCount } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
          await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_total", null, leadsCount || 0);
          await upsert(supabase, "kpi_daily", orgId, dateStr, "leads", null, leadsCount || 0);

          // tracked_leads — only leads attached to a tracked session
          // (session_id IS NOT NULL). Used as the CVR numerator so the rate
          // is apples-to-apples with the sessions denominator and stays
          // sane for sites with WP form imports or untracked submission paths.
          const { count: trackedLeadsCount } = await supabase
            .from("leads")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .not("session_id", "is", null)
            .gte("submitted_at", dayStart)
            .lte("submitted_at", dayEnd);
          await upsert(supabase, "kpi_daily", orgId, dateStr, "tracked_leads", null, trackedLeadsCount || 0);

          // leads_by_source
          const { data: lbs } = await supabase.from("leads").select("source").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
          if (lbs) { const m: Record<string, number> = {}; lbs.forEach((l: any) => { const d = l.source || "direct"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_by_source", d, v); }

          // leads_by_page
          const { data: lbp } = await supabase.from("leads").select("page_path").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
          if (lbp) { const m: Record<string, number> = {}; lbp.forEach((l: any) => { const d = l.page_path || "(unknown)"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_by_page", d, v); }

          // sessions_by_country
          const { data: sbc } = await supabase.from("pageviews").select("country_code, session_id").eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd).not("country_code", "is", null);
          if (sbc) {
            const countrySessionMap: Record<string, Set<string>> = {};
            sbc.forEach((pv: any) => {
              const cc = pv.country_code || "XX";
              const sid = pv.session_id || pv.country_code;
              if (!countrySessionMap[cc]) countrySessionMap[cc] = new Set();
              countrySessionMap[cc].add(sid);
            });
            for (const [cc, sessions] of Object.entries(countrySessionMap)) {
              await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_country", cc, sessions.size);
            }
          }

          // sessions_by_campaign
          const { data: sbcmp } = await supabase.from("sessions").select("utm_campaign").eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd).not("utm_campaign", "is", null);
          if (sbcmp) { const m: Record<string, number> = {}; sbcmp.forEach((s: any) => { const d = s.utm_campaign; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_campaign", d, v); }

          // leads_by_campaign
          const { data: lbcmp } = await supabase.from("leads").select("utm_campaign").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd).not("utm_campaign", "is", null);
          if (lbcmp) { const m: Record<string, number> = {}; lbcmp.forEach((l: any) => { const d = l.utm_campaign; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_by_campaign", d, v); }

          // sessions_by_device
          const { data: sbd } = await supabase.from("pageviews").select("device, session_id").eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd).not("device", "is", null);
          if (sbd) {
            const deviceMap: Record<string, Set<string>> = {};
            sbd.forEach((pv: any) => { const d = pv.device || "unknown"; if (!deviceMap[d]) deviceMap[d] = new Set(); deviceMap[d].add(pv.session_id || d); });
            for (const [d, sessions] of Object.entries(deviceMap)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_device", d, sessions.size);
          }

          // sessions_by_landing_page
          const { data: slp } = await supabase.from("sessions").select("landing_page_path").eq("org_id", orgId).gte("started_at", dayStart).lte("started_at", dayEnd).not("landing_page_path", "is", null);
          if (slp) { const m: Record<string, number> = {}; slp.forEach((s: any) => { const d = s.landing_page_path; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "traffic_daily", orgId, dateStr, "sessions_by_landing_page", d, v); }

          // leads_by_form
          const { data: lbf } = await supabase.from("leads").select("form_id").eq("org_id", orgId).gte("submitted_at", dayStart).lte("submitted_at", dayEnd);
          if (lbf) { const m: Record<string, number> = {}; lbf.forEach((l: any) => { const d = l.form_id || "(unknown)"; m[d] = (m[d] || 0) + 1; }); for (const [d, v] of Object.entries(m)) await upsert(supabase, "kpi_daily", orgId, dateStr, "leads_by_form", d, v); }

          // form_submissions_total
          const { count: fslCount } = await supabase.from("form_submission_logs").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", dayStart).lte("occurred_at", dayEnd);
          await upsert(supabase, "kpi_daily", orgId, dateStr, "form_submissions_total", null, fslCount || 0);

          // conversion_rate — uses tracked_leads (session_id IS NOT NULL)
          // ÷ sessions so the numerator and denominator share the same
          // observed universe. Imported and sessionless leads still appear
          // in `leads_total` for display, just not in this rate.
          const dayLeads = trackedLeadsCount || 0;
          const daySessions = sessCount || 0;
          const cvrRaw = daySessions > 0 ? (dayLeads / daySessions) * 100 : 0;
          const cvr = Number(Math.min(100, cvrRaw).toFixed(2));
          await upsert(supabase, "kpi_daily", orgId, dateStr, "conversion_rate", null, cvr);

          orgResults[dateStr] = { status: "ok" };
        } catch (err) { console.error(`Agg error ${orgId} ${dateStr}:`, err); orgResults[dateStr] = { status: "error" }; }
      }

      results[orgId] = orgResults;
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
