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

    let query = supabase.from("report_runs").select("*").eq("status", "queued").order("created_at").limit(1);
    if (runId) query = supabase.from("report_runs").select("*").eq("id", runId).limit(1);

    const { data: runs, error: runErr } = await query;
    if (runErr) throw runErr;
    if (!runs || runs.length === 0) return json({ message: "No queued runs" });

    const run = runs[0];
    const orgId = run.org_id;
    const params = run.params || {};
    const periodDays = params.period_days || 30;
    const templateSlug = run.template_slug || "monthly-performance";
    const compareMode = params.compare_mode || "previous";
    const filterSource = params.filter_source || null;
    const filterCampaign = params.filter_campaign || null;

    await supabase.from("report_runs").update({ status: "running" }).eq("id", run.id);

    try {
      const now = new Date();
      const periodEnd = params.end_date
        ? new Date(params.end_date + "T23:59:59Z").toISOString()
        : now.toISOString();
      const periodStart = params.start_date
        ? new Date(params.start_date + "T00:00:00Z").toISOString()
        : new Date(now.getTime() - periodDays * 86400000).toISOString();
      const actualDays = Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) || periodDays;

      // Comparison period
      let prevStart: string | null = null;
      let prevEnd: string | null = null;
      if (compareMode === "previous") {
        prevEnd = periodStart;
        prevStart = new Date(new Date(periodStart).getTime() - actualDays * 86400000).toISOString();
      } else if (compareMode === "yoy") {
        const startDate = new Date(periodStart);
        const endDate = new Date(periodEnd);
        prevStart = new Date(startDate.getFullYear() - 1, startDate.getMonth(), startDate.getDate()).toISOString();
        prevEnd = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate()).toISOString();
      }
      // compareMode === "none" → prevStart/prevEnd stay null

      // Build base queries with optional filters
      const applyFilters = (q: any, sourceCol: string, campaignCol: string) => {
        if (filterSource) q = q.eq(sourceCol, filterSource);
        if (filterCampaign) q = q.eq(campaignCol, filterCampaign);
        return q;
      };

      // ── Parallel data fetches ──
      const fetchPromises: Promise<any>[] = [
        applyFilters(supabase.from("leads").select("*").eq("org_id", orgId).gte("submitted_at", periodStart).lte("submitted_at", periodEnd), "utm_source", "utm_campaign"),
        prevStart ? applyFilters(supabase.from("leads").select("*").eq("org_id", orgId).gte("submitted_at", prevStart).lte("submitted_at", prevEnd!), "utm_source", "utm_campaign") : Promise.resolve({ data: [] }),
        applyFilters(supabase.from("sessions").select("*").eq("org_id", orgId).gte("started_at", periodStart).lte("started_at", periodEnd).limit(5000), "utm_source", "utm_campaign"),
        prevStart ? applyFilters(supabase.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", prevStart).lte("started_at", prevEnd!), "utm_source", "utm_campaign") : Promise.resolve({ data: null, count: 0 }),
        supabase.from("forms").select("*").eq("org_id", orgId),
        supabase.from("goals").select("*").eq("org_id", orgId).gte("month", periodStart.slice(0, 10)).limit(1),
      ];

      // Only fetch pageviews for monthly performance (not needed for campaign/weekly brief as much)
      if (templateSlug !== "campaign-report") {
        fetchPromises.push(
          supabase.from("pageviews").select("*").eq("org_id", orgId).gte("occurred_at", periodStart).lte("occurred_at", periodEnd).limit(5000),
          prevStart ? supabase.from("pageviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", prevStart).lte("occurred_at", prevEnd!) : Promise.resolve({ data: null, count: 0 }),
        );
      }

      // Fetch ad_spend for campaign reports
      if (templateSlug === "campaign-report") {
        fetchPromises.push(
          supabase.from("ad_spend").select("*").eq("org_id", orgId),
        );
      }

      const results = await Promise.all(fetchPromises);

      const currentLeads = results[0].data || [];
      const previousLeads = results[1].data || [];
      const currentSessions = results[2].data || [];
      const prevSessionCount = results[3].count ?? (results[3].data?.length || 0);
      const formList = results[4].data || [];
      const goals = results[5].data || [];

      let currentPageviews: any[] = [];
      let prevPageviewCount = 0;
      let adSpendData: any[] = [];

      if (templateSlug !== "campaign-report") {
        currentPageviews = results[6]?.data || [];
        prevPageviewCount = results[7]?.count ?? 0;
      }
      if (templateSlug === "campaign-report" && results.length > 6) {
        adSpendData = results[6]?.data || [];
      }

      const formMap: Record<string, any> = {};
      formList.forEach((f: any) => { formMap[f.id] = f; });

      const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

      let report: any;

      if (templateSlug === "weekly-brief") {
        report = buildWeeklyBrief({ currentLeads, previousLeads, currentSessions, prevSessionCount, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode });
      } else if (templateSlug === "campaign-report") {
        report = buildCampaignReport({ currentLeads, previousLeads, currentSessions, prevSessionCount, formList, formMap, adSpendData, periodStart, periodEnd, actualDays, pctChange, compareMode });
      } else {
        report = buildMonthlyPerformance({ currentLeads, previousLeads, currentSessions, prevSessionCount, currentPageviews, prevPageviewCount, formList, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode });
      }

      report.generatedAt = now.toISOString();
      report.periodStart = periodStart;
      report.periodEnd = periodEnd;
      report.periodDays = actualDays;
      report.templateSlug = templateSlug;
      report.orgId = orgId;
      report.compareMode = compareMode;
      if (filterSource) report.filterSource = filterSource;
      if (filterCampaign) report.filterCampaign = filterCampaign;

      // Store in bucket
      const fileName = `report_${run.id}.json`;
      const { error: uploadErr } = await supabase.storage
        .from("reports")
        .upload(fileName, JSON.stringify(report, null, 2), {
          contentType: "application/json",
          upsert: true,
        });
      if (uploadErr) { console.error("Upload error:", uploadErr); throw uploadErr; }

      const { error: updateErr } = await supabase.from("report_runs").update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        file_path: fileName,
        error: null,
      }).eq("id", run.id);
      if (updateErr) { console.error("Update error:", updateErr); throw updateErr; }

      return json({ message: "Report generated", run_id: run.id });
    } catch (processErr) {
      console.error("Report processing error:", processErr);
      await supabase.from("report_runs").update({
        status: "failed",
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

// ── MONTHLY PERFORMANCE (full 5-section report) ──
function buildMonthlyPerformance({ currentLeads, previousLeads, currentSessions, prevSessionCount, currentPageviews, prevPageviewCount, formList, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode }: any) {
  const totalLeads = currentLeads.length;
  const prevTotalLeads = previousLeads.length;
  const totalSessions = currentSessions.length;
  const prevTotalSessions = prevSessionCount;
  const totalPageviews = currentPageviews.length;
  const prevTotalPageviews = prevPageviewCount;
  const cvr = totalSessions > 0 ? (totalLeads / totalSessions) * 100 : 0;
  const prevCvr = prevTotalSessions > 0 ? (prevTotalLeads / prevTotalSessions) * 100 : 0;

  const weightedLeads = currentLeads.reduce((sum: number, l: any) => sum + (formMap[l.form_id]?.lead_weight || 1), 0);

  let keyWin = "", keyRisk = "";
  if (pctChange(totalLeads, prevTotalLeads) > 0) keyWin = `Leads increased ${pctChange(totalLeads, prevTotalLeads)}% vs ${compareMode === "yoy" ? "same period last year" : "previous period"}`;
  else if (pctChange(totalPageviews, prevTotalPageviews) > 0) keyWin = `Traffic grew ${pctChange(totalPageviews, prevTotalPageviews)}%`;
  else keyWin = "Stable performance maintained";

  if (pctChange(totalLeads, prevTotalLeads) < -10) keyRisk = `Lead volume declined ${Math.abs(pctChange(totalLeads, prevTotalLeads))}%`;
  else if (cvr < prevCvr && prevCvr > 0) keyRisk = `CVR dropped from ${prevCvr.toFixed(1)}% to ${cvr.toFixed(1)}%`;
  else keyRisk = "No significant risks detected";

  const noComparison = compareMode === "none";

  const executiveSummary = {
    leads: { current: totalLeads, previous: noComparison ? null : prevTotalLeads, change: noComparison ? null : pctChange(totalLeads, prevTotalLeads) },
    weightedLeads: Math.round(weightedLeads * 10) / 10,
    sessions: { current: totalSessions, previous: noComparison ? null : prevTotalSessions, change: noComparison ? null : pctChange(totalSessions, prevTotalSessions) },
    pageviews: { current: totalPageviews, previous: noComparison ? null : prevTotalPageviews, change: noComparison ? null : pctChange(totalPageviews, prevTotalPageviews) },
    cvr: { current: Math.round(cvr * 100) / 100, previous: noComparison ? null : Math.round(prevCvr * 100) / 100, change: noComparison ? null : pctChange(cvr, prevCvr) },
    goalTarget: goals?.[0]?.target_leads || null,
    keyWin, keyRisk,
  };

  const growthEngine = {
    trafficBySource: countBy(currentSessions, (s: any) => s.utm_source || s.landing_referrer_domain || "direct"),
    trafficByMedium: countBy(currentSessions, (s: any) => s.utm_medium || "none"),
    topLandingPages: countBy(currentSessions, (s: any) => s.landing_page_path || "/").slice(0, 10),
  };

  const leadsByForm = formList.map((f: any) => {
    const fl = currentLeads.filter((l: any) => l.form_id === f.id);
    const pfl = previousLeads.filter((l: any) => l.form_id === f.id);
    return { formName: f.name, formCategory: f.form_category, leads: fl.length, previousLeads: noComparison ? null : pfl.length, change: noComparison ? null : pctChange(fl.length, pfl.length), weight: f.lead_weight };
  }).sort((a: any, b: any) => b.leads - a.leads);

  const conversionIntelligence = {
    leadsByForm,
    topConvertingPages: countBy(currentLeads, (l: any) => l.page_path || l.page_url || "unknown").slice(0, 10),
    leadSources: countBy(currentLeads, (l: any) => l.source || l.utm_source || "direct"),
  };

  const userExperience = {
    deviceBreakdown: countBy(currentPageviews, (pv: any) => pv.device || "unknown"),
    geoBreakdown: countBy(currentPageviews, (pv: any) => pv.country_name || pv.country_code || "Unknown").slice(0, 10),
    topPages: countBy(currentPageviews, (pv: any) => pv.page_path || "/").slice(0, 15),
    referrerBreakdown: countBy(currentPageviews, (pv: any) => pv.referrer_domain || "direct").slice(0, 10),
  };

  // Action plan
  const actions: string[] = [];
  const pageLeadMap = new Map<string, number>();
  currentLeads.forEach((l: any) => { const p = l.page_path || ""; pageLeadMap.set(p, (pageLeadMap.get(p) || 0) + 1); });
  const pageViewMap = new Map<string, number>();
  currentPageviews.forEach((pv: any) => { const p = pv.page_path || ""; pageViewMap.set(p, (pageViewMap.get(p) || 0) + 1); });
  const opportunities: Array<{ page: string; views: number; leads: number }> = [];
  pageViewMap.forEach((views, page) => { if (views > 10 && (pageLeadMap.get(page) || 0) === 0) opportunities.push({ page, views, leads: 0 }); });
  opportunities.sort((a, b) => b.views - a.views);

  if (opportunities.length > 0) actions.push(`Add CTAs to high-traffic pages: ${opportunities.slice(0, 3).map(o => o.page).join(", ")}`);
  if (!noComparison && pctChange(totalLeads, prevTotalLeads) < 0) actions.push("Investigate declining lead volume.");
  if (cvr < 2) actions.push("CVR below 2% — test form placement and social proof.");

  const dailyLeads = new Map<string, number>();
  currentLeads.forEach((l: any) => { const day = l.submitted_at?.slice(0, 10) || ""; dailyLeads.set(day, (dailyLeads.get(day) || 0) + 1); });
  const dailyCounts = [...dailyLeads.values()];
  const avgDaily = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;
  const projectedNextMonth = Math.round(avgDaily * 30);
  if (projectedNextMonth > 0) actions.push(`Projected leads next month: ${Math.round(projectedNextMonth * 0.9)}–${Math.round(projectedNextMonth * 1.1)}.`);
  if (actions.length === 0) actions.push("Continue current strategy — performance is stable.");

  return {
    executiveSummary, growthEngine, conversionIntelligence, userExperience,
    actionPlan: { recommendations: actions, contentOpportunities: opportunities.slice(0, 5), forecast: { avgDailyLeads: Math.round(avgDaily * 10) / 10, projectedNextMonth } },
  };
}

// ── WEEKLY BRIEF (condensed KPI snapshot) ──
function buildWeeklyBrief({ currentLeads, previousLeads, currentSessions, prevSessionCount, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode }: any) {
  const totalLeads = currentLeads.length;
  const prevTotalLeads = previousLeads.length;
  const totalSessions = currentSessions.length;
  const prevTotalSessions = prevSessionCount;
  const cvr = totalSessions > 0 ? (totalLeads / totalSessions) * 100 : 0;
  const prevCvr = prevTotalSessions > 0 ? (prevTotalLeads / prevTotalSessions) * 100 : 0;
  const noComparison = compareMode === "none";

  const weightedLeads = currentLeads.reduce((sum: number, l: any) => sum + (formMap[l.form_id]?.lead_weight || 1), 0);

  // Top 3 changes
  const changes: Array<{ metric: string; current: number; previous: number; change: number }> = [];
  if (!noComparison) {
    changes.push(
      { metric: "Leads", current: totalLeads, previous: prevTotalLeads, change: pctChange(totalLeads, prevTotalLeads) },
      { metric: "Sessions", current: totalSessions, previous: prevTotalSessions, change: pctChange(totalSessions, prevTotalSessions) },
      { metric: "CVR", current: Math.round(cvr * 100) / 100, previous: Math.round(prevCvr * 100) / 100, change: pctChange(cvr, prevCvr) },
    );
    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }

  // Top sources this period
  const topSources = countBy(currentSessions, (s: any) => s.utm_source || s.landing_referrer_domain || "direct").slice(0, 5);

  // 1-2 quick action items
  const actions: string[] = [];
  if (!noComparison && pctChange(totalLeads, prevTotalLeads) < -10) actions.push("Lead volume dropped — review form visibility and traffic sources.");
  if (cvr < 2) actions.push("CVR is low — consider A/B testing landing pages.");
  if (actions.length === 0) actions.push("Performance is steady — continue current strategy.");

  return {
    kpiSnapshot: {
      leads: { current: totalLeads, previous: noComparison ? null : prevTotalLeads, change: noComparison ? null : pctChange(totalLeads, prevTotalLeads) },
      sessions: { current: totalSessions, previous: noComparison ? null : prevTotalSessions, change: noComparison ? null : pctChange(totalSessions, prevTotalSessions) },
      cvr: { current: Math.round(cvr * 100) / 100, previous: noComparison ? null : Math.round(prevCvr * 100) / 100, change: noComparison ? null : pctChange(cvr, prevCvr) },
      weightedLeads: Math.round(weightedLeads * 10) / 10,
      goalTarget: goals?.[0]?.target_leads || null,
    },
    topChanges: changes.slice(0, 3),
    topSources,
    actions,
  };
}

// ── CAMPAIGN REPORT (UTM-grouped) ──
function buildCampaignReport({ currentLeads, previousLeads, currentSessions, prevSessionCount, formList, formMap, adSpendData, periodStart, periodEnd, actualDays, pctChange, compareMode }: any) {
  const noComparison = compareMode === "none";

  // Group by utm_campaign
  const campaignMap = new Map<string, { leads: any[]; sessions: any[]; prevLeads: any[] }>();
  const getCampaign = (item: any) => item.utm_campaign || "no-campaign";

  currentSessions.forEach((s: any) => {
    const c = getCampaign(s);
    if (!campaignMap.has(c)) campaignMap.set(c, { leads: [], sessions: [], prevLeads: [] });
    campaignMap.get(c)!.sessions.push(s);
  });
  currentLeads.forEach((l: any) => {
    const c = getCampaign(l);
    if (!campaignMap.has(c)) campaignMap.set(c, { leads: [], sessions: [], prevLeads: [] });
    campaignMap.get(c)!.leads.push(l);
  });
  if (!noComparison) {
    previousLeads.forEach((l: any) => {
      const c = getCampaign(l);
      if (!campaignMap.has(c)) campaignMap.set(c, { leads: [], sessions: [], prevLeads: [] });
      campaignMap.get(c)!.prevLeads.push(l);
    });
  }

  // Build ad spend lookup: source+month → spend
  const spendLookup = new Map<string, number>();
  adSpendData.forEach((a: any) => {
    spendLookup.set(a.source, (spendLookup.get(a.source) || 0) + a.spend);
  });

  const campaignBreakdown = [...campaignMap.entries()].map(([campaign, data]) => {
    const leads = data.leads.length;
    const sessions = data.sessions.length;
    const cvr = sessions > 0 ? Math.round((leads / sessions) * 10000) / 100 : 0;
    const prevLeads = data.prevLeads.length;
    const spend = spendLookup.get(campaign) || null;
    const cpl = spend && leads > 0 ? Math.round((spend / leads) * 100) / 100 : null;

    return {
      campaign,
      leads,
      previousLeads: noComparison ? null : prevLeads,
      leadsChange: noComparison ? null : pctChange(leads, prevLeads),
      sessions,
      cvr,
      spend,
      cpl,
    };
  }).sort((a, b) => b.leads - a.leads);

  // Totals
  const totalLeads = currentLeads.length;
  const prevTotalLeads = previousLeads.length;
  const totalSessions = currentSessions.length;
  const cvr = totalSessions > 0 ? Math.round((totalLeads / totalSessions) * 10000) / 100 : 0;
  const totalSpend = adSpendData.reduce((s: number, a: any) => s + (a.spend || 0), 0);
  const overallCpl = totalSpend > 0 && totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : null;

  // Top converting campaigns
  const topByLeads = campaignBreakdown.filter(c => c.campaign !== "no-campaign").slice(0, 5);

  const actions: string[] = [];
  const noCampaignLeads = campaignBreakdown.find(c => c.campaign === "no-campaign");
  if (noCampaignLeads && noCampaignLeads.leads > totalLeads * 0.3) {
    actions.push("30%+ of leads have no campaign tag — ensure UTM tagging on all campaign links.");
  }
  const highSpendLowLeads = campaignBreakdown.filter(c => c.spend && c.spend > 0 && c.leads === 0);
  if (highSpendLowLeads.length > 0) {
    actions.push(`${highSpendLowLeads.length} campaign(s) have ad spend but zero leads — review targeting.`);
  }
  if (actions.length === 0) actions.push("Campaign performance looks healthy.");

  return {
    summary: {
      totalLeads,
      previousTotalLeads: noComparison ? null : prevTotalLeads,
      leadsChange: noComparison ? null : pctChange(totalLeads, prevTotalLeads),
      totalSessions,
      cvr,
      totalSpend: totalSpend || null,
      overallCpl,
    },
    campaignBreakdown,
    topCampaigns: topByLeads,
    actions,
  };
}

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
