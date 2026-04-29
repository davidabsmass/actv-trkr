import { appCorsHeaders } from '../_shared/cors.ts'
import { checkUserRateLimit, rateLimitResponse } from '../_shared/rate-limiter.ts'
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers are now dynamic — computed per-request via appCorsHeaders(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: appCorsHeaders(req) });

  // Accept either cron secret OR valid JWT
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  const isCron = cronSecret && incoming === cronSecret;

  let callerUserId: string | null = null;

  if (!isCron) {
    // Try JWT auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }
    const tempClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await tempClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...appCorsHeaders(req), "Content-Type": "application/json" } });
    }
    callerUserId = user.id;

    // Rate limit check (skip for cron)
    const rl = await checkUserRateLimit(callerUserId, "process-report");
    if (!rl.allowed) return rateLimitResponse(appCorsHeaders(req), rl.retryAfterMs);
  }

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
    const templateSlug = run.template_slug || "monthly_performance";
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
      // deno-lint-ignore no-explicit-any
      const fetchPromises: any[] = [
        applyFilters(supabase.from("leads").select("*").eq("org_id", orgId).gte("submitted_at", periodStart).lte("submitted_at", periodEnd), "utm_source", "utm_campaign"),
        prevStart ? applyFilters(supabase.from("leads").select("*").eq("org_id", orgId).gte("submitted_at", prevStart).lte("submitted_at", prevEnd!), "utm_source", "utm_campaign") : Promise.resolve({ data: [] }),
        applyFilters(supabase.from("sessions").select("*").eq("org_id", orgId).gte("started_at", periodStart).lte("started_at", periodEnd).limit(5000), "utm_source", "utm_campaign"),
        prevStart ? applyFilters(supabase.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", prevStart).lte("started_at", prevEnd!), "utm_source", "utm_campaign") : Promise.resolve({ data: null, count: 0 }),
        supabase.from("forms").select("*").eq("org_id", orgId),
        supabase.from("goals").select("*").eq("org_id", orgId).gte("month", periodStart.slice(0, 10)).limit(1),
        // Exact session count (not limited by row fetch cap)
        applyFilters(supabase.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", periodStart).lte("started_at", periodEnd), "utm_source", "utm_campaign"),
      ];

      // Only fetch pageviews for monthly performance (not needed for campaign/weekly brief as much)
      if (templateSlug !== "campaign_report") {
        fetchPromises.push(
          supabase.from("pageviews").select("*").eq("org_id", orgId).gte("occurred_at", periodStart).lte("occurred_at", periodEnd).limit(5000),
          prevStart ? supabase.from("pageviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", prevStart).lte("occurred_at", prevEnd!) : Promise.resolve({ data: null, count: 0 }),
          // Exact current pageview count
          supabase.from("pageviews").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("occurred_at", periodStart).lte("occurred_at", periodEnd),
        );
      }

      // Fetch ad_spend for campaign reports
      if (templateSlug === "campaign_report") {
        fetchPromises.push(
          supabase.from("ad_spend").select("*").eq("org_id", orgId),
        );
      }

      // Additional data for monthly performance: incidents, form submission logs, broken links
      // deno-lint-ignore no-explicit-any
      const extraPromises: any[] = [];
      if (templateSlug === "monthly_performance") {
        extraPromises.push(
          supabase.from("incidents").select("*").eq("org_id", orgId).gte("started_at", periodStart).lte("started_at", periodEnd).order("started_at", { ascending: false }).limit(50),
          supabase.from("form_submission_logs").select("*").eq("org_id", orgId).gte("occurred_at", periodStart).lte("occurred_at", periodEnd).limit(1000),
          supabase.from("broken_links").select("*").eq("org_id", orgId).order("last_seen_at", { ascending: false }).limit(50),
          supabase.from("sites").select("id, domain, status, last_heartbeat_at").eq("org_id", orgId),
          supabase.from("conversion_goals").select("*").eq("org_id", orgId).eq("is_active", true),
          supabase.from("goal_completions").select("goal_id,page_url,page_path,target_text,completed_at").eq("org_id", orgId).gte("completed_at", periodStart).lte("completed_at", periodEnd).order("completed_at", { ascending: false }).limit(2000),
          supabase.from("events").select("event_type,page_url,page_path,target_text,occurred_at,meta").eq("org_id", orgId).in("event_type", ["cta_click","outbound_click","tel_click","mailto_click"]).gte("occurred_at", periodStart).lte("occurred_at", periodEnd).order("occurred_at", { ascending: false }).limit(2000),
          // Org install date — used to suppress misleading WoW % comparisons
          // when the prior period predates the install
          supabase.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
        );
      }

      const [results, extraResults] = await Promise.all([
        Promise.all(fetchPromises),
        Promise.all(extraPromises),
      ]);

      const currentLeads = results[0].data || [];
      const previousLeads = results[1].data || [];
      const currentSessions = results[2].data || [];
      const prevSessionCount = results[3].count ?? (results[3].data?.length || 0);
      const formList = results[4].data || [];
      const goals = results[5].data || [];
      const currentSessionCount = results[6].count ?? currentSessions.length;

      let currentPageviews: any[] = [];
      let prevPageviewCount = 0;
      let currentPageviewCount = 0;
      let adSpendData: any[] = [];

      if (templateSlug !== "campaign_report") {
        currentPageviews = results[7]?.data || [];
        prevPageviewCount = results[8]?.count ?? 0;
        currentPageviewCount = results[9]?.count ?? currentPageviews.length;
      }
      if (templateSlug === "campaign_report" && results.length > 7) {
        adSpendData = results[7]?.data || [];
      }

      // Extra data for monthly performance
      let incidents: any[] = [];
      let formSubmissionLogs: any[] = [];
      let brokenLinks: any[] = [];
      let sitesData: any[] = [];
      let conversionGoals: any[] = [];
      let goalCompletionsRaw: any[] = [];
      let clickEventsRaw: any[] = [];
      let orgCreatedAt: string | null = null;
      if (templateSlug === "monthly_performance" && extraResults.length >= 4) {
        incidents = extraResults[0]?.data || [];
        formSubmissionLogs = extraResults[1]?.data || [];
        brokenLinks = extraResults[2]?.data || [];
        sitesData = extraResults[3]?.data || [];
        conversionGoals = extraResults[4]?.data || [];
        goalCompletionsRaw = extraResults[5]?.data || [];
        clickEventsRaw = extraResults[6]?.data || [];
        orgCreatedAt = extraResults[7]?.data?.created_at || null;
      }

      const formMap: Record<string, any> = {};
      formList.forEach((f: any) => { formMap[f.id] = f; });

      const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

      let report: any;

      if (templateSlug === "weekly_brief") {
        report = buildWeeklyBrief({ currentLeads, previousLeads, currentSessions, currentSessionCount, prevSessionCount, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode });
      } else if (templateSlug === "campaign_report") {
        report = buildCampaignReport({ currentLeads, previousLeads, currentSessions, currentSessionCount, prevSessionCount, formList, formMap, adSpendData, periodStart, periodEnd, actualDays, pctChange, compareMode });
      } else {
        report = buildMonthlyPerformance({ currentLeads, previousLeads, currentSessions, currentSessionCount, prevSessionCount, currentPageviews, currentPageviewCount, prevPageviewCount, formList, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode, incidents, formSubmissionLogs, brokenLinks, sitesData, conversionGoals, goalCompletionsRaw, clickEventsRaw, orgCreatedAt });
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

      // ── AI Insights (monthly only) ──
      if (templateSlug === "monthly_performance") {
        try {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY) {
            const aiPrompt = `You are a digital marketing analyst. Analyze this monthly performance data and provide 3-5 concise, actionable insights. Focus on what's working, what needs attention, and specific recommendations. Be direct and data-driven.

Data summary:
- Period: ${actualDays} days
- Leads: ${report.executiveSummary.leads.current}${report.executiveSummary.leads.change !== null ? ` (${report.executiveSummary.leads.change > 0 ? '+' : ''}${report.executiveSummary.leads.change}% vs previous)` : ''}
- Sessions: ${report.executiveSummary.sessions.current}${report.executiveSummary.sessions.change !== null ? ` (${report.executiveSummary.sessions.change > 0 ? '+' : ''}${report.executiveSummary.sessions.change}%)` : ''}
- Pageviews: ${report.executiveSummary.pageviews.current}${report.executiveSummary.pageviews.change !== null ? ` (${report.executiveSummary.pageviews.change > 0 ? '+' : ''}${report.executiveSummary.pageviews.change}%)` : ''}
- CVR: ${report.executiveSummary.cvr.current}%
- Weighted Leads: ${report.executiveSummary.weightedLeads}
- Top sources: ${(report.growthEngine.trafficBySource || []).slice(0, 5).map((s: any) => `${s.label} (${s.count})`).join(', ')}
- Top forms: ${(report.conversionIntelligence.leadsByForm || []).slice(0, 5).map((f: any) => `${f.formName}: ${f.leads} leads, ${f.cvr}% CVR, ${f.failures} failures`).join('; ')}
- Uptime: ${report.siteHealth?.uptimePercent ?? 100}%, downtime incidents: ${report.siteHealth?.downtimeIncidents?.length ?? 0}
- Broken links: ${report.siteHealth?.brokenLinksCount ?? 0}
- Form failure rate: ${report.formHealth?.overallFailureRate ?? 0}%
- Estimated pipeline value: $${report.formHealth?.totalEstimatedValue ?? 0}

Return a JSON array of objects with "title" (short headline) and "body" (1-2 sentence explanation). No markdown, just valid JSON array.`;

            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: [{ role: "user", content: aiPrompt }],
              }),
            });

            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const raw = aiData.choices?.[0]?.message?.content || "";
              // Extract JSON from response (may have markdown wrapping)
              const jsonMatch = raw.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                report.aiInsights = JSON.parse(jsonMatch[0]);
              }
            }
          }
        } catch (aiErr) {
          console.error("AI insights error (non-fatal):", aiErr);
          // AI insights are optional — don't fail the report
        }
      }

      // Store in bucket
      const fileName = `${orgId}/report_${run.id}.json`;
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
      headers: { ...appCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

// ── MONTHLY PERFORMANCE (full 5-section report) ──
function buildMonthlyPerformance({ currentLeads, previousLeads, currentSessions, currentSessionCount, prevSessionCount, currentPageviews, currentPageviewCount, prevPageviewCount, formList, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode, incidents, formSubmissionLogs, brokenLinks, sitesData, conversionGoals, goalCompletionsRaw, clickEventsRaw, orgCreatedAt }: any) {
  const totalLeads = currentLeads.length;
  const prevTotalLeads = previousLeads.length;
  const totalSessions = currentSessionCount;
  const prevTotalSessions = prevSessionCount;
  const totalPageviews = currentPageviewCount;
  const prevTotalPageviews = prevPageviewCount;
  const cvr = totalSessions > 0 ? (totalLeads / totalSessions) * 100 : 0;
  const prevCvr = prevTotalSessions > 0 ? (prevTotalLeads / prevTotalSessions) * 100 : 0;

  const weightedLeads = currentLeads.reduce((sum: number, l: any) => sum + (formMap[l.form_id]?.lead_weight || 1), 0);

  // ── Install-age guard for % comparisons ──
  // Only emit "%-change" headlines when the install was alive for the FULL
  // prior comparison window AND the prior period had a meaningful sample.
  // Otherwise we get misleading "+100%" results from 0→1 or partial windows.
  const MIN_PREV_SAMPLE = 5;
  const noComparison = compareMode === "none";
  const prevPeriodStartMs = noComparison
    ? null
    : new Date(new Date(periodStart).getTime() - actualDays * 86400000).getTime();
  const orgCreatedMs = orgCreatedAt ? new Date(orgCreatedAt).getTime() : null;
  const installCoversPrevPeriod = !noComparison && orgCreatedMs !== null && prevPeriodStartMs !== null
    ? orgCreatedMs <= prevPeriodStartMs
    : false;
  const comparisonReliable = !noComparison && installCoversPrevPeriod && prevTotalLeads >= MIN_PREV_SAMPLE;

  let keyWin = "", keyRisk = "";
  if (comparisonReliable && pctChange(totalLeads, prevTotalLeads) > 0) {
    keyWin = `Leads increased ${pctChange(totalLeads, prevTotalLeads)}% vs ${compareMode === "yoy" ? "same period last year" : "previous period"}`;
  } else if (comparisonReliable && pctChange(totalPageviews, prevTotalPageviews) > 0) {
    keyWin = `Traffic grew ${pctChange(totalPageviews, prevTotalPageviews)}%`;
  } else if (totalLeads > 0) {
    keyWin = `Captured ${totalLeads} lead${totalLeads === 1 ? "" : "s"} over ${actualDays} day${actualDays === 1 ? "" : "s"}`;
  } else if (totalSessions > 0) {
    keyWin = `${totalSessions.toLocaleString()} sessions tracked — building baseline`;
  } else {
    keyWin = "Stable performance maintained";
  }

  if (comparisonReliable && pctChange(totalLeads, prevTotalLeads) < -10) {
    keyRisk = `Lead volume declined ${Math.abs(pctChange(totalLeads, prevTotalLeads))}%`;
  } else if (comparisonReliable && cvr < prevCvr && prevCvr > 0) {
    keyRisk = `CVR dropped from ${prevCvr.toFixed(1)}% to ${cvr.toFixed(1)}%`;
  } else if (!comparisonReliable && !noComparison) {
    keyRisk = "Not enough history yet for trend comparison";
  } else {
    keyRisk = "No significant risks detected";
  }

  const executiveSummary = {
    leads: { current: totalLeads, previous: noComparison || !comparisonReliable ? null : prevTotalLeads, change: noComparison || !comparisonReliable ? null : pctChange(totalLeads, prevTotalLeads) },
    weightedLeads: Math.round(weightedLeads * 10) / 10,
    sessions: { current: totalSessions, previous: noComparison || !comparisonReliable ? null : prevTotalSessions, change: noComparison || !comparisonReliable ? null : pctChange(totalSessions, prevTotalSessions) },
    pageviews: { current: totalPageviews, previous: noComparison || !comparisonReliable ? null : prevTotalPageviews, change: noComparison || !comparisonReliable ? null : pctChange(totalPageviews, prevTotalPageviews) },
    cvr: { current: Math.round(cvr * 100) / 100, previous: noComparison || !comparisonReliable ? null : Math.round(prevCvr * 100) / 100, change: noComparison || !comparisonReliable ? null : pctChange(cvr, prevCvr) },
    goalTarget: goals?.[0]?.target_leads || null,
    keyWin, keyRisk,
  };

  const growthEngine = {
    trafficBySource: countBy(currentSessions, (s: any) => s.utm_source || s.landing_referrer_domain || "direct"),
    trafficByMedium: countBy(currentSessions, (s: any) => s.utm_medium || "none"),
    topLandingPages: countBy(currentSessions, (s: any) => s.landing_page_path || "/").slice(0, 10),
  };

  // ── Form Performance (enhanced) ──
  // Use leads as the authoritative submission count; form_submission_logs is only
  // used for failure diagnostics (it may be empty if the site doesn't emit logs).
  const leadsByForm = formList.map((f: any) => {
    const fl = currentLeads.filter((l: any) => l.form_id === f.id);
    const pfl = previousLeads.filter((l: any) => l.form_id === f.id);
    const logs = (formSubmissionLogs || []).filter((log: any) => log.form_id === f.id);
    const failedLogs = logs.filter((l: any) => l.status !== "success");
    // CVR per form: leads from this form / total sessions for the site
    // Using total sessions gives a meaningful site-level conversion rate
    const totalSessionCount = currentSessions.length;
    const formCvr = totalSessionCount > 0 ? Math.round((fl.length / totalSessionCount) * 10000) / 100 : 0;

    return {
      formName: f.name,
      formCategory: f.form_category,
      leads: fl.length,
      previousLeads: noComparison ? null : pfl.length,
      change: noComparison ? null : pctChange(fl.length, pfl.length),
      weight: f.lead_weight,
      estimatedValue: f.estimated_value || 0,
      totalValue: fl.length * (f.estimated_value || 0),
      submissions: fl.length,
      failures: failedLogs.length,
      failureRate: (fl.length + failedLogs.length) > 0 ? Math.round((failedLogs.length / (fl.length + failedLogs.length)) * 10000) / 100 : 0,
      cvr: formCvr,
      isPrimaryLead: f.is_primary_lead,
    };
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

  // ── Site Health & Downtime ──
  const downtimeIncidents = (incidents || []).filter((i: any) => i.type === "DOWNTIME");
  const otherIncidents = (incidents || []).filter((i: any) => i.type !== "DOWNTIME");
  const totalDowntimeMinutes = downtimeIncidents.reduce((sum: number, inc: any) => {
    const start = new Date(inc.started_at).getTime();
    const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : Date.now();
    return sum + (end - start) / 60000;
  }, 0);
  const uptimePercent = actualDays > 0 ? Math.max(0, Math.round((1 - totalDowntimeMinutes / (actualDays * 1440)) * 10000) / 100) : 100;

  const siteHealth = {
    uptimePercent,
    totalDowntimeMinutes: Math.round(totalDowntimeMinutes),
    downtimeIncidents: downtimeIncidents.slice(0, 10).map((i: any) => ({
      domain: i.details?.domain || "unknown",
      startedAt: i.started_at,
      resolvedAt: i.resolved_at,
      durationMinutes: Math.round(((i.resolved_at ? new Date(i.resolved_at).getTime() : Date.now()) - new Date(i.started_at).getTime()) / 60000),
      severity: i.severity,
    })),
    otherIncidents: otherIncidents.slice(0, 5).map((i: any) => ({
      type: i.type,
      severity: i.severity,
      startedAt: i.started_at,
      resolvedAt: i.resolved_at,
    })),
    brokenLinksCount: (brokenLinks || []).length,
    topBrokenLinks: (brokenLinks || []).slice(0, 5).map((bl: any) => ({
      url: bl.broken_url,
      sourcePage: bl.source_page,
      statusCode: bl.status_code,
      occurrences: bl.occurrences,
    })),
    sites: (sitesData || []).map((s: any) => ({
      domain: s.domain,
      status: s.status,
      lastSignal: s.last_heartbeat_at,
    })),
  };

  // ── Form submission health ──
  // Use leads count as the primary submission metric; form_submission_logs
  // failures are additive (they represent attempts that never became leads).
  const logFailures = (formSubmissionLogs || []).filter((l: any) => l.status !== "success").length;
  const totalSubmissions = currentLeads.length + logFailures;
  const totalFailures = logFailures;
  const overallFailureRate = totalSubmissions > 0 ? Math.round((totalFailures / totalSubmissions) * 10000) / 100 : 0;

  const formHealth = {
    totalSubmissions,
    totalFailures,
    overallFailureRate,
    totalEstimatedValue: leadsByForm.reduce((s: number, f: any) => s + (f.totalValue || 0), 0),
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
  if (downtimeIncidents.length > 0) actions.push(`${downtimeIncidents.length} downtime incident(s) this period — review server/hosting stability.`);
  if (overallFailureRate > 5) actions.push(`Form failure rate at ${overallFailureRate}% — investigate integration issues.`);
  if ((brokenLinks || []).length > 0) actions.push(`${brokenLinks.length} broken link(s) detected — fix to improve SEO and user experience.`);

  const dailyLeads = new Map<string, number>();
  currentLeads.forEach((l: any) => { const day = l.submitted_at?.slice(0, 10) || ""; dailyLeads.set(day, (dailyLeads.get(day) || 0) + 1); });
  const dailyCounts = [...dailyLeads.values()];
  const avgDaily = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;
  const projectedNextMonth = Math.round(avgDaily * 30);
  if (projectedNextMonth > 0) actions.push(`Projected leads next month: ${Math.round(projectedNextMonth * 0.9)}–${Math.round(projectedNextMonth * 1.1)}.`);
  if (actions.length === 0) actions.push("Continue current strategy — performance is stable.");

  // ── Goal Conversions ──
  const CLICK_TYPES = ["cta_click", "outbound_click", "tel_click", "mailto_click"];
  const goalConversionsData = (conversionGoals || []).map((goal: any) => {
    const rules = goal.tracking_rules || {};
    // Count from goal_completions first
    let count = (goalCompletionsRaw || []).filter((gc: any) => gc.goal_id === goal.id).length;

    // Fallback to events for click goals
    if (count === 0 && CLICK_TYPES.includes(goal.goal_type)) {
      count = (clickEventsRaw || []).filter((evt: any) => {
        const text = (evt.target_text || "").toLowerCase();
        const label = String((evt.meta as any)?.target_label || "").toLowerCase();
        const href = String((evt.meta as any)?.target_href || "").toLowerCase();
        const url = (evt.page_url || "").toLowerCase();
        if (rules.text_contains) {
          const needle = String(rules.text_contains).toLowerCase();
          if (!text.includes(needle) && !label.includes(needle)) return false;
        }
        if (rules.href_contains) {
          const needle = String(rules.href_contains).toLowerCase();
          if (!href.includes(needle) && !url.includes(needle) && !text.includes(needle)) return false;
        }
        return true;
      }).length;
    }

    return { name: goal.name, goalType: goal.goal_type, count };
  }).sort((a: any, b: any) => b.count - a.count);

  const goalConversions = {
    goals: goalConversionsData,
    totalCompletions: goalConversionsData.reduce((s: number, g: any) => s + g.count, 0),
  };

  return {
    executiveSummary, growthEngine, conversionIntelligence, userExperience, siteHealth, formHealth, goalConversions,
    actionPlan: { recommendations: actions, contentOpportunities: opportunities.slice(0, 5), forecast: { avgDailyLeads: Math.round(avgDaily * 10) / 10, projectedNextMonth } },
  };
}
// ── WEEKLY BRIEF (condensed KPI snapshot) ──
function buildWeeklyBrief({ currentLeads, previousLeads, currentSessions, currentSessionCount, prevSessionCount, formMap, goals, periodStart, periodEnd, actualDays, pctChange, compareMode }: any) {
  const totalLeads = currentLeads.length;
  const prevTotalLeads = previousLeads.length;
  const totalSessions = currentSessionCount;
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
function buildCampaignReport({ currentLeads, previousLeads, currentSessions, currentSessionCount, prevSessionCount, formList, formMap, adSpendData, periodStart, periodEnd, actualDays, pctChange, compareMode }: any) {
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
  const totalSessions = currentSessionCount;
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
