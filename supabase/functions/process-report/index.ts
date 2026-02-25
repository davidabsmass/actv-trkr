import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let runId: string | null = null;
    try {
      const body = await req.json();
      runId = body.run_id || null;
    } catch { /* no body */ }

    // Find the run
    let query = supabase.from("report_runs").select("*").eq("status", "queued").order("created_at").limit(1);
    if (runId) query = supabase.from("report_runs").select("*").eq("id", runId).limit(1);

    const { data: runs, error: runErr } = await query;
    if (runErr) throw runErr;
    if (!runs || runs.length === 0) {
      return json({ message: "No queued runs" });
    }

    const run = runs[0];
    const orgId = run.org_id;
    const params = run.params || {};
    const periodDays = params.period_days || 30;

    await supabase.from("report_runs").update({ status: "running" }).eq("id", run.id);

    try {
      const now = new Date();
      // Use explicit start/end dates if provided, otherwise fall back to period_days
      const periodEnd = params.end_date
        ? new Date(params.end_date + "T23:59:59Z").toISOString()
        : now.toISOString();
      const periodStart = params.start_date
        ? new Date(params.start_date + "T00:00:00Z").toISOString()
        : new Date(now.getTime() - periodDays * 86400000).toISOString();
      const actualDays = Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) || periodDays;
      const prevEnd = periodStart;
      const prevStart = new Date(new Date(periodStart).getTime() - actualDays * 86400000).toISOString();

      // ── Parallel data fetches ──
      const [
        { data: leads },
        { data: prevLeads },
        { data: pageviews },
        { data: prevPageviews },
        { data: sessions },
        { data: prevSessions },
        { data: forms },
        { data: goals },
      ] = await Promise.all([
        supabase.from("leads").select("*").eq("org_id", orgId).gte("submitted_at", periodStart).lte("submitted_at", periodEnd),
        supabase.from("leads").select("*").eq("org_id", orgId).gte("submitted_at", prevStart).lte("submitted_at", prevEnd),
        supabase.from("pageviews").select("*").eq("org_id", orgId).gte("occurred_at", periodStart).lte("occurred_at", periodEnd).limit(5000),
        supabase.from("pageviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", prevStart).lte("occurred_at", prevEnd),
        supabase.from("sessions").select("*").eq("org_id", orgId).gte("started_at", periodStart).lte("started_at", periodEnd).limit(5000),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", prevStart).lte("started_at", prevEnd),
        supabase.from("forms").select("*").eq("org_id", orgId),
        supabase.from("goals").select("*").eq("org_id", orgId).gte("month", periodStart.slice(0, 10)).limit(1),
      ]);

      const currentLeads = leads || [];
      const previousLeads = prevLeads || [];
      const currentPageviews = pageviews || [];
      const prevPageviewCount = prevPageviews as any;
      const currentSessions = sessions || [];
      const prevSessionCount = prevSessions as any;
      const formList = forms || [];

      const formMap: Record<string, any> = {};
      formList.forEach((f: any) => { formMap[f.id] = f; });

      // ── 1) EXECUTIVE SUMMARY ──
      const totalLeads = currentLeads.length;
      const prevTotalLeads = previousLeads.length;
      const totalSessions = currentSessions.length;
      const prevTotalSessions = typeof prevSessionCount === "number" ? prevSessionCount : (prevSessions as any)?.length || 0;
      const totalPageviews = currentPageviews.length;
      const prevTotalPageviews = typeof prevPageviewCount === "number" ? prevPageviewCount : 0;
      const cvr = totalSessions > 0 ? (totalLeads / totalSessions) * 100 : 0;
      const prevCvr = prevTotalSessions > 0 ? (prevTotalLeads / prevTotalSessions) * 100 : 0;

      const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

      // Weighted leads
      const weightedLeads = currentLeads.reduce((sum: number, l: any) => {
        const form = formMap[l.form_id];
        return sum + (form?.lead_weight || 1);
      }, 0);

      // Key win / key risk
      let keyWin = "";
      let keyRisk = "";
      if (pctChange(totalLeads, prevTotalLeads) > 0) keyWin = `Leads increased ${pctChange(totalLeads, prevTotalLeads)}% vs previous period`;
      else if (pctChange(totalPageviews, prevTotalPageviews) > 0) keyWin = `Traffic grew ${pctChange(totalPageviews, prevTotalPageviews)}%`;
      else keyWin = "Stable performance maintained";

      if (pctChange(totalLeads, prevTotalLeads) < -10) keyRisk = `Lead volume declined ${Math.abs(pctChange(totalLeads, prevTotalLeads))}% — investigate traffic sources`;
      else if (cvr < prevCvr && prevCvr > 0) keyRisk = `Conversion rate dropped from ${prevCvr.toFixed(1)}% to ${cvr.toFixed(1)}% — review landing page experience`;
      else keyRisk = "No significant risks detected this period";

      const executiveSummary = {
        leads: { current: totalLeads, previous: prevTotalLeads, change: pctChange(totalLeads, prevTotalLeads) },
        weightedLeads: Math.round(weightedLeads * 10) / 10,
        sessions: { current: totalSessions, previous: prevTotalSessions, change: pctChange(totalSessions, prevTotalSessions) },
        pageviews: { current: totalPageviews, previous: prevTotalPageviews, change: pctChange(totalPageviews, prevTotalPageviews) },
        cvr: { current: Math.round(cvr * 100) / 100, previous: Math.round(prevCvr * 100) / 100, change: pctChange(cvr, prevCvr) },
        goalTarget: goals?.[0]?.target_leads || null,
        keyWin,
        keyRisk,
      };

      // ── 2) GROWTH ENGINE ──
      const trafficBySource = countBy(currentSessions, (s: any) => s.utm_source || s.landing_referrer_domain || "direct");
      const topLandingPages = countBy(currentSessions, (s: any) => s.landing_page_path || "/").slice(0, 10);
      const trafficByMedium = countBy(currentSessions, (s: any) => s.utm_medium || "none");

      const growthEngine = {
        trafficBySource,
        trafficByMedium,
        topLandingPages,
      };

      // ── 3) CONVERSION INTELLIGENCE ──
      const leadsByForm = formList.map((f: any) => {
        const formLeads = currentLeads.filter((l: any) => l.form_id === f.id);
        const prevFormLeads = previousLeads.filter((l: any) => l.form_id === f.id);
        return {
          formName: f.name,
          formCategory: f.form_category,
          leads: formLeads.length,
          previousLeads: prevFormLeads.length,
          change: pctChange(formLeads.length, prevFormLeads.length),
          weight: f.lead_weight,
        };
      }).sort((a: any, b: any) => b.leads - a.leads);

      // Top converting pages (pages that drove leads)
      const topConvertingPages = countBy(currentLeads, (l: any) => l.page_path || l.page_url || "unknown").slice(0, 10);

      // High-intent pages (pages visited before conversion — approximated by lead page paths)
      const leadSources = countBy(currentLeads, (l: any) => l.source || l.utm_source || "direct");

      const conversionIntelligence = {
        leadsByForm,
        topConvertingPages,
        leadSources,
        newVsReturning: {
          newVisitors: currentSessions.filter((s: any) => !previousLeads.some((l: any) => l.visitor_id && l.visitor_id === s.visitor_id)).length,
          returningVisitors: currentSessions.filter((s: any) => previousLeads.some((l: any) => l.visitor_id && l.visitor_id === s.visitor_id)).length,
        },
      };

      // ── 4) USER EXPERIENCE SIGNALS ──
      const deviceBreakdown = countBy(currentPageviews, (pv: any) => pv.device || "unknown");
      const geoBreakdown = countBy(currentPageviews, (pv: any) => pv.country_name || pv.country_code || "Unknown").slice(0, 10);
      const topPages = countBy(currentPageviews, (pv: any) => pv.page_path || "/").slice(0, 15);
      const referrerBreakdown = countBy(currentPageviews, (pv: any) => pv.referrer_domain || "direct").slice(0, 10);

      const userExperience = {
        deviceBreakdown,
        geoBreakdown,
        topPages,
        referrerBreakdown,
      };

      // ── 5) ACTION PLAN (Auto-generated) ──
      const actions: string[] = [];

      // Find high-traffic low-conversion pages
      const pageLeadMap = new Map<string, number>();
      currentLeads.forEach((l: any) => {
        const p = l.page_path || "";
        pageLeadMap.set(p, (pageLeadMap.get(p) || 0) + 1);
      });
      const pageViewMap = new Map<string, number>();
      currentPageviews.forEach((pv: any) => {
        const p = pv.page_path || "";
        pageViewMap.set(p, (pageViewMap.get(p) || 0) + 1);
      });
      const opportunities: Array<{ page: string; views: number; leads: number }> = [];
      pageViewMap.forEach((views, page) => {
        if (views > 10 && (pageLeadMap.get(page) || 0) === 0) {
          opportunities.push({ page, views, leads: 0 });
        }
      });
      opportunities.sort((a, b) => b.views - a.views);

      if (opportunities.length > 0) {
        actions.push(`Add conversion elements (CTAs, forms) to high-traffic pages: ${opportunities.slice(0, 3).map(o => o.page).join(", ")}`);
      }

      if (pctChange(totalLeads, prevTotalLeads) < 0) {
        actions.push("Investigate declining lead volume — check form visibility and page load speed on key landing pages.");
      }

      if (cvr < 2) {
        actions.push("Conversion rate is below 2% — consider A/B testing form placement, reducing form fields, or adding social proof near CTAs.");
      }

      const topSource = trafficBySource[0];
      if (topSource && topSource.label === "direct") {
        actions.push("Most traffic is direct/unattributed — ensure UTM tagging on all campaign links and email newsletters.");
      }

      if (deviceBreakdown.find((d: any) => d.label === "mobile" && d.count > totalPageviews * 0.5)) {
        actions.push("Mobile traffic exceeds 50% — prioritize mobile UX optimization and page speed.");
      }

      // Forecast
      const dailyLeads = new Map<string, number>();
      currentLeads.forEach((l: any) => {
        const day = l.submitted_at?.slice(0, 10) || "";
        dailyLeads.set(day, (dailyLeads.get(day) || 0) + 1);
      });
      const dailyCounts = [...dailyLeads.values()];
      const avgDaily = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;
      const projectedNextMonth = Math.round(avgDaily * 30);

      if (projectedNextMonth > 0) {
        actions.push(`Based on current trends, projected leads next month: ${Math.round(projectedNextMonth * 0.9)}–${Math.round(projectedNextMonth * 1.1)}.`);
      }

      if (actions.length === 0) {
        actions.push("Continue current strategy — performance is stable. Focus on content creation and engagement optimization.");
      }

      const actionPlan = {
        recommendations: actions,
        contentOpportunities: opportunities.slice(0, 5),
        forecast: {
          avgDailyLeads: Math.round(avgDaily * 10) / 10,
          projectedNextMonth,
        },
      };

      // ── Assemble report ──
      const report = {
        generatedAt: now.toISOString(),
        periodStart,
        periodEnd,
        periodDays: actualDays,
        templateSlug: run.template_slug,
        orgId,
        executiveSummary,
        growthEngine,
        conversionIntelligence,
        userExperience,
        actionPlan,
      };

      // Store in bucket
      const fileName = `report_${run.id}.json`;
      const { error: uploadErr } = await supabase.storage
        .from("reports")
        .upload(fileName, new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), {
          contentType: "application/json",
          upsert: true,
        });
      if (uploadErr) throw uploadErr;

      await supabase.from("report_runs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        file_path: fileName,
        error: null,
      }).eq("id", run.id);

      return json({ message: "Report generated", run_id: run.id });
    } catch (processErr) {
      console.error("Report processing error:", processErr);
      await supabase.from("report_runs").update({
        status: "error",
        error: processErr instanceof Error ? processErr.message : "Unknown error",
      }).eq("id", run.id);
      throw processErr;
    }
  } catch (err) {
    console.error("Report error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Content-Type": "application/json",
    },
  });
}

function countBy(arr: any[], keyFn: (item: any) => string): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  arr.forEach((item) => {
    const key = keyFn(item) || "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
