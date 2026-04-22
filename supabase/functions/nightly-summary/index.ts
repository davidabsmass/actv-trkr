import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Deterministic finding types ──
type Severity = "high" | "medium" | "low";
interface Finding {
  type: string;
  category: string;
  page?: string;
  title: string;
  explanation: string;
  metric_values: Record<string, number | string>;
  severity: Severity;
  confidence: number;
  recommended_action?: string;
  positive: boolean;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Generate findings from aggregated metrics ──
function generateFindings(m: {
  currentSessions: number; previousSessions: number;
  currentLeads: number; previousLeads: number;
  currentCvr: number; previousCvr: number;
  topPages?: Array<{ path: string; views: number; exits: number; leads: number; avgTime?: number }>;
  deviceBreakdown?: Array<{ device: string; sessions: number; leads: number }>;
  formStats?: Array<{ name: string; starts: number; submissions: number }>;
  seoScore?: number; previousSeoScore?: number;
  brokenLinksCount?: number; activeIncidents?: number;
  organicSessions?: number; previousOrganicSessions?: number;
  orgAgeDays?: number;
}): Finding[] {
  const findings: Finding[] = [];
  const orgTooNew = m.orgAgeDays !== undefined && m.orgAgeDays < 14; // need 2 weeks for nightly comparison

  // Traffic
  if (!orgTooNew) {
    const sessionsPct = pctChange(m.currentSessions, m.previousSessions);
    if (sessionsPct >= 10) {
      findings.push({ type: "traffic_up", category: "Traffic", positive: true,
        title: "Traffic is growing",
        explanation: `Sessions increased ${sessionsPct}% compared to the previous period.`,
        metric_values: { current: m.currentSessions, previous: m.previousSessions, change: sessionsPct },
        severity: "low", confidence: 0.9 });
    } else if (sessionsPct <= -10) {
      findings.push({ type: "traffic_down", category: "Traffic", positive: false,
        title: "Traffic declined",
        explanation: `Sessions dropped ${Math.abs(sessionsPct)}% compared to the previous period.`,
        metric_values: { current: m.currentSessions, previous: m.previousSessions, change: sessionsPct },
        severity: sessionsPct <= -25 ? "high" : "medium", confidence: 0.9,
        recommended_action: "Review top landing pages and traffic sources for changes." });
    }
  }

  // Leads
  if (!orgTooNew) {
    const leadsPct = pctChange(m.currentLeads, m.previousLeads);
    if (leadsPct >= 10) {
      findings.push({ type: "lead_growth", category: "Lead Tracking", positive: true,
        title: "Lead volume is up",
        explanation: `Leads increased ${leadsPct}% compared to the previous period.`,
        metric_values: { current: m.currentLeads, previous: m.previousLeads, change: leadsPct },
        severity: "low", confidence: 0.9 });
    } else if (leadsPct <= -10) {
      findings.push({ type: "lead_drop", category: "Lead Tracking", positive: false,
        title: "Leads declined",
        explanation: `Leads dropped ${Math.abs(leadsPct)}% compared to the previous period.`,
        metric_values: { current: m.currentLeads, previous: m.previousLeads, change: leadsPct },
        severity: leadsPct <= -25 ? "high" : "medium", confidence: 0.9,
        recommended_action: "Check form health and top lead sources for anomalies." });
    }
  }

  // CVR
  if (!orgTooNew) {
    const cvrPct = pctChange(m.currentCvr, m.previousCvr);
    if (cvrPct >= 10) {
      findings.push({ type: "conversion_gain", category: "Conversion", positive: true,
        title: "Conversion rate improved",
        explanation: `Conversion rate improved ${cvrPct}% compared to the previous period.`,
        metric_values: { current: `${m.currentCvr}%`, previous: `${m.previousCvr}%`, change: cvrPct },
        severity: "low", confidence: 0.85 });
    } else if (cvrPct <= -10) {
      findings.push({ type: "conversion_drop", category: "Conversion", positive: false,
        title: "Conversion rate dropped",
        explanation: `Conversion rate declined ${Math.abs(cvrPct)}% compared to the previous period.`,
        metric_values: { current: `${m.currentCvr}%`, previous: `${m.previousCvr}%`, change: cvrPct },
        severity: cvrPct <= -25 ? "high" : "medium", confidence: 0.85,
        recommended_action: "Review landing pages and form experience for friction." });
    }
  }

  // Organic traffic
  if (!orgTooNew && m.organicSessions !== undefined && m.previousOrganicSessions !== undefined) {
    const orgPct = pctChange(m.organicSessions, m.previousOrganicSessions);
    if (orgPct >= 15) {
      findings.push({ type: "organic_traffic_up", category: "SEO", positive: true,
        title: "Organic search traffic increased",
        explanation: `Organic sessions grew ${orgPct}% compared to the previous period.`,
        metric_values: { current: m.organicSessions, previous: m.previousOrganicSessions, change: orgPct },
        severity: "low", confidence: 0.85 });
    } else if (orgPct <= -15) {
      findings.push({ type: "organic_traffic_down", category: "SEO", positive: false,
        title: "Organic search traffic declined",
        explanation: `Organic sessions dropped ${Math.abs(orgPct)}% compared to the previous period.`,
        metric_values: { current: m.organicSessions, previous: m.previousOrganicSessions, change: orgPct },
        severity: "medium", confidence: 0.85,
        recommended_action: "Review SEO insights for ranking changes." });
    }
  }

  // High-exit pages
  if (m.topPages) {
    for (const page of m.topPages.slice(0, 10)) {
      const exitRate = page.views > 0 ? (page.exits / page.views) * 100 : 0;
      if (page.views >= 30 && exitRate > 70) {
        findings.push({ type: "high_exit_rate", category: "Engagement", positive: false,
          title: "High exit rate",
          explanation: `${page.path} has a ${exitRate.toFixed(0)}% exit rate with ${page.views} views.`,
          page: page.path,
          metric_values: { views: page.views, exits: page.exits, exitRate: `${exitRate.toFixed(0)}%` },
          severity: exitRate > 85 ? "high" : "medium", confidence: 0.75,
          recommended_action: "Review page content and calls to action." });
        if (findings.filter(f => f.type === "high_exit_rate").length >= 2) break;
      }
    }

    // High traffic low conversion
    const avgCvr = m.currentCvr || 1;
    for (const page of m.topPages.slice(0, 15)) {
      const pageCvr = page.views > 0 ? (page.leads / page.views) * 100 : 0;
      if (page.views >= 50 && pageCvr < avgCvr * 0.5 && pageCvr < 1) {
        findings.push({ type: "high_intent_low_performance", category: "Conversion", positive: false,
          title: "High traffic, low conversions",
          explanation: `${page.path} gets significant traffic but converts below average.`,
          page: page.path,
          metric_values: { views: page.views, leads: page.leads, cvr: `${pageCvr.toFixed(1)}%` },
          severity: "medium", confidence: 0.8,
          recommended_action: "Review CTA placement and page clarity." });
        if (findings.filter(f => f.type === "high_intent_low_performance").length >= 2) break;
      }
    }

    // Strong engagement weak visibility (high time on page but low traffic)
    for (const page of m.topPages) {
      if (page.avgTime && page.avgTime > 120 && page.views < 20) {
        findings.push({ type: "strong_engagement_low_visibility", category: "SEO", positive: false,
          title: "Strong engagement, limited visibility",
          explanation: `${page.path} shows strong engagement (${Math.round(page.avgTime)}s avg) but has low traffic.`,
          page: page.path,
          metric_values: { avgTime: `${Math.round(page.avgTime)}s`, views: page.views },
          severity: "medium", confidence: 0.7,
          recommended_action: "Consider improving SEO for this page to drive more traffic." });
        if (findings.filter(f => f.type === "strong_engagement_low_visibility").length >= 1) break;
      }
    }
  }

  // Mobile dropoff
  if (m.deviceBreakdown && m.deviceBreakdown.length >= 2) {
    const desktop = m.deviceBreakdown.find(d => d.device === "desktop");
    const mobile = m.deviceBreakdown.find(d => d.device === "mobile");
    if (desktop && mobile && desktop.sessions > 10 && mobile.sessions > 10) {
      const dCvr = desktop.leads / desktop.sessions;
      const mCvr = mobile.leads / mobile.sessions;
      if (dCvr > 0 && mCvr < dCvr * 0.5) {
        findings.push({ type: "mobile_dropoff", category: "Engagement", positive: false,
          title: "Mobile users convert less",
          explanation: "Mobile conversion rate is significantly lower than desktop.",
          metric_values: { desktopCvr: `${(dCvr * 100).toFixed(1)}%`, mobileCvr: `${(mCvr * 100).toFixed(1)}%` },
          severity: "medium", confidence: 0.8,
          recommended_action: "Review the mobile experience on key landing pages." });
      }
    }
  }

  // Form abandonment
  if (m.formStats) {
    for (const form of m.formStats) {
      if (form.starts >= 5 && form.submissions < form.starts * 0.4) {
        const abandonRate = Math.round((1 - form.submissions / form.starts) * 100);
        findings.push({ type: "form_abandonment", category: "Conversion", positive: false,
          title: "Form abandonment is high",
          explanation: `"${form.name}" has a ${abandonRate}% abandonment rate.`,
          metric_values: { starts: form.starts, submissions: form.submissions, abandonRate: `${abandonRate}%` },
          severity: abandonRate > 75 ? "high" : "medium", confidence: 0.7,
          recommended_action: "Simplify form fields or check for errors." });
        if (findings.filter(f => f.type === "form_abandonment").length >= 2) break;
      }
    }
  }

  // SEO score
  if (m.seoScore !== undefined && m.previousSeoScore !== undefined) {
    const diff = m.seoScore - m.previousSeoScore;
    if (diff >= 5) {
      findings.push({ type: "seo_visibility_gain", category: "SEO", positive: true,
        title: "SEO score improved",
        explanation: `SEO score went from ${m.previousSeoScore} to ${m.seoScore}.`,
        metric_values: { current: m.seoScore, previous: m.previousSeoScore },
        severity: "low", confidence: 0.8 });
    } else if (diff <= -5) {
      findings.push({ type: "seo_visibility_loss", category: "SEO", positive: false,
        title: "SEO score declined",
        explanation: `SEO score dropped from ${m.previousSeoScore} to ${m.seoScore}.`,
        metric_values: { current: m.seoScore, previous: m.previousSeoScore },
        severity: "medium", confidence: 0.8,
        recommended_action: "Run an SEO scan to identify new issues." });
    }
  }

  // Site health
  if ((m.brokenLinksCount ?? 0) > 5) {
    findings.push({ type: "site_health_issue", category: "Site Health", positive: false,
      title: "Broken links detected",
      explanation: `${m.brokenLinksCount} broken links found on your site.`,
      metric_values: { count: m.brokenLinksCount ?? 0 },
      severity: (m.brokenLinksCount ?? 0) > 20 ? "high" : "medium", confidence: 0.95,
      recommended_action: "Fix or remove broken links to improve user experience and SEO." });
  }
  if ((m.activeIncidents ?? 0) > 0) {
    findings.push({ type: "site_health_issue", category: "Site Health", positive: false,
      title: "Active monitoring incidents",
      explanation: `${m.activeIncidents} unresolved incidents are being tracked.`,
      metric_values: { count: m.activeIncidents ?? 0 },
      severity: "high", confidence: 1,
      recommended_action: "Check the Monitoring page for details." });
  }

  // Sort by severity then negative first
  const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => {
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    if (a.positive !== b.positive) return a.positive ? 1 : -1;
    return 0;
  });

  return findings;
}

// ── Score findings for ranking ──
function scoreFinding(f: Finding): number {
  let score = 0;
  score += f.severity === "high" ? 30 : f.severity === "medium" ? 20 : 10;
  score += f.confidence * 20;
  if (!f.positive) score += 15;
  const views = Number(f.metric_values?.views) || 0;
  if (views > 100) score += 10;
  if (views > 500) score += 10;
  return score;
}

serve(async (req) => {
  console.log("nightly-summary invoked", req.method);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Note: this function is triggered by cron or internal tools only

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: orgs } = await supabase.from("orgs").select("id, name, created_at");
    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({ message: "No orgs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const d = (offset: number) => {
      const dt = new Date(now.getTime() - offset * 86400000);
      return dt.toISOString().split("T")[0];
    };
    const periodEnd = d(0);
    const periodStart = d(7);
    const prevStart = d(14);
    const prevEnd = d(7);

    const results: string[] = [];

    for (const org of orgs) {
      try {
        // ── Step 1: Aggregate metrics ──
        const [
          sessRes, prevSessRes, leadsRes, prevLeadsRes,
          brokenRes, incidentsRes, seoRes, prevSeoRes,
        ] = await Promise.all([
          supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "sessions").gte("date", periodStart).lte("date", periodEnd),
          supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "sessions").gte("date", prevStart).lt("date", prevEnd),
          supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "leads").gte("date", periodStart).lte("date", periodEnd),
          supabase.from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "leads").gte("date", prevStart).lt("date", prevEnd),
          supabase.from("broken_links").select("id", { count: "exact", head: true }).eq("org_id", org.id),
          supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("resolved_at", null),
          supabase.from("seo_scans").select("score").eq("org_id", org.id).order("scanned_at", { ascending: false }).limit(1),
          supabase.from("seo_scans").select("score").eq("org_id", org.id).order("scanned_at", { ascending: false }).range(1, 1),
        ]);

        const sum = (rows: any[] | null) => (rows || []).reduce((s: number, r: any) => s + Number(r.value || 0), 0);
        const currentSessions = sum(sessRes.data);
        const previousSessions = sum(prevSessRes.data);
        const currentLeads = sum(leadsRes.data);
        const previousLeads = sum(prevLeadsRes.data);
        const currentCvr = currentSessions > 0 ? Math.round((currentLeads / currentSessions) * 10000) / 100 : 0;
        const previousCvr = previousSessions > 0 ? Math.round((previousLeads / previousSessions) * 10000) / 100 : 0;

        // Page-level data
        const { data: pageData } = await supabase
          .from("kpi_daily")
          .select("dimension, value, metric")
          .eq("org_id", org.id)
          .in("metric", ["page_views", "page_exits", "page_leads", "page_avg_time"])
          .gte("date", periodStart)
          .lte("date", periodEnd);

        const pageMap: Record<string, { views: number; exits: number; leads: number; avgTime: number; avgCount: number }> = {};
        for (const row of (pageData || [])) {
          if (!row.dimension) continue;
          if (!pageMap[row.dimension]) pageMap[row.dimension] = { views: 0, exits: 0, leads: 0, avgTime: 0, avgCount: 0 };
          const v = Number(row.value || 0);
          if (row.metric === "page_views") pageMap[row.dimension].views += v;
          else if (row.metric === "page_exits") pageMap[row.dimension].exits += v;
          else if (row.metric === "page_leads") pageMap[row.dimension].leads += v;
          else if (row.metric === "page_avg_time") { pageMap[row.dimension].avgTime += v; pageMap[row.dimension].avgCount += 1; }
        }
        const topPages = Object.entries(pageMap)
          .map(([path, d]) => ({ path, views: d.views, exits: d.exits, leads: d.leads, avgTime: d.avgCount > 0 ? d.avgTime / d.avgCount : 0 }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 20);

        // Device breakdown
        const { data: deviceData } = await supabase
          .from("kpi_daily")
          .select("dimension, value, metric")
          .eq("org_id", org.id)
          .in("metric", ["device_sessions", "device_leads"])
          .gte("date", periodStart)
          .lte("date", periodEnd);

        const deviceMap: Record<string, { sessions: number; leads: number }> = {};
        for (const row of (deviceData || [])) {
          if (!row.dimension) continue;
          if (!deviceMap[row.dimension]) deviceMap[row.dimension] = { sessions: 0, leads: 0 };
          if (row.metric === "device_sessions") deviceMap[row.dimension].sessions += Number(row.value || 0);
          else if (row.metric === "device_leads") deviceMap[row.dimension].leads += Number(row.value || 0);
        }
        const deviceBreakdown = Object.entries(deviceMap).map(([device, d]) => ({ device, ...d }));

        // Form stats
        const { data: formStartData } = await supabase
          .from("form_submission_logs")
          .select("form_id, status")
          .eq("org_id", org.id)
          .gte("occurred_at", new Date(now.getTime() - 7 * 86400000).toISOString());

        const { data: formsData } = await supabase
          .from("forms")
          .select("id, name")
          .eq("org_id", org.id)
          .eq("archived", false);

        const formNameMap: Record<string, string> = {};
        for (const f of (formsData || [])) formNameMap[f.id] = f.name;

        const formStatsMap: Record<string, { starts: number; submissions: number }> = {};
        for (const row of (formStartData || [])) {
          const fid = row.form_id || "unknown";
          if (!formStatsMap[fid]) formStatsMap[fid] = { starts: 0, submissions: 0 };
          formStatsMap[fid].starts += 1;
          if (row.status === "success") formStatsMap[fid].submissions += 1;
        }
        const formStats = Object.entries(formStatsMap).map(([fid, d]) => ({
          name: formNameMap[fid] || "Unknown Form", ...d,
        }));

        // Organic sessions
        const { data: orgSess } = await supabase
          .from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "organic_sessions").gte("date", periodStart).lte("date", periodEnd);
        const { data: prevOrgSess } = await supabase
          .from("kpi_daily").select("value").eq("org_id", org.id).eq("metric", "organic_sessions").gte("date", prevStart).lt("date", prevEnd);

        const seoScore = seoRes.data?.[0]?.score;
        const previousSeoScore = prevSeoRes.data?.[0]?.score;

        // ── Step 2: Generate findings ──
        const orgAgeDays = org.created_at
          ? Math.floor((Date.now() - new Date(org.created_at).getTime()) / (1000 * 60 * 60 * 24))
          : undefined;
        const allFindings = generateFindings({
          currentSessions, previousSessions,
          currentLeads, previousLeads,
          currentCvr, previousCvr,
          topPages, deviceBreakdown, formStats,
          seoScore, previousSeoScore,
          brokenLinksCount: brokenRes.count || 0,
          activeIncidents: incidentsRes.count || 0,
          organicSessions: sum(orgSess?.length ? orgSess : null),
          previousOrganicSessions: sum(prevOrgSess?.length ? prevOrgSess : null),
          orgAgeDays,
        });

        // ── Step 3: Rank and select top findings ──
        const scored = allFindings.map(f => ({ f, score: scoreFinding(f) }));
        scored.sort((a, b) => b.score - a.score);
        const topFindings = scored.slice(0, 5).map(s => s.f);

        // ── Step 4: AI summarization ──
        let summaryText = "";
        let insights: string[] = [];
        let suggestedActions: string[] = [];

        if (topFindings.length > 0) {
          const aiPayload = {
            site_name: org.name,
            period: "last 7 days vs previous 7 days",
            sessions_change: pctChange(currentSessions, previousSessions),
            lead_change: pctChange(currentLeads, previousLeads),
            conversion_change: pctChange(currentCvr, previousCvr),
            seo_score: seoScore,
            top_findings: topFindings,
          };

          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              temperature: 0.3,
              messages: [
                {
                  role: "system",
                  content: `You are a business-friendly website performance assistant. Generate a nightly summary.

RULES:
- Be specific and reference actual numbers
- Never use technical jargon
- Keep sentences short and scannable
- Don't invent explanations not supported by the data
- Don't be robotic or overhyped
- Use calm, professional language
- Never say "plummeted", "crashed", "alarming" — use "dropped", "declined", "decreased" instead`,
                },
                {
                  role: "user",
                  content: `Generate a nightly website performance summary from this data:\n\n${JSON.stringify(aiPayload, null, 2)}`,
                },
              ],
              tools: [{
                type: "function",
                function: {
                  name: "return_nightly_summary",
                  description: "Return the nightly summary",
                  parameters: {
                    type: "object",
                    properties: {
                      summary: { type: "string", description: "2-3 sentence summary paragraph" },
                      insights: { type: "array", items: { type: "string" }, description: "3-5 plain-English insight statements" },
                      suggested_actions: { type: "array", items: { type: "string" }, description: "1-3 recommended actions" },
                    },
                    required: ["summary", "insights", "suggested_actions"],
                    additionalProperties: false,
                  },
                },
              }],
              tool_choice: { type: "function", function: { name: "return_nightly_summary" } },
            }),
          });

          if (aiResp.ok) {
            const aiData = await aiResp.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
              const parsed = JSON.parse(toolCall.function.arguments);
              summaryText = parsed.summary || "";
              insights = parsed.insights || [];
              suggestedActions = parsed.suggested_actions || [];
            }
          } else {
            console.error(`AI error for ${org.name}: ${aiResp.status}`);
            // Fallback: use finding explanations
            summaryText = topFindings.slice(0, 2).map(f => f.explanation).join(" ");
            insights = topFindings.map(f => f.explanation);
            suggestedActions = topFindings.filter(f => f.recommended_action).map(f => f.recommended_action!).slice(0, 3);
          }
        } else {
          summaryText = "No significant changes detected this week. Your site is performing steadily.";
        }

        // ── Step 5: Store in nightly_summaries ──
        const metricsSnapshot = {
          sessions: { current: currentSessions, previous: previousSessions, change: pctChange(currentSessions, previousSessions) },
          leads: { current: currentLeads, previous: previousLeads, change: pctChange(currentLeads, previousLeads) },
          cvr: { current: currentCvr, previous: previousCvr, change: pctChange(currentCvr, previousCvr) },
          brokenLinks: brokenRes.count || 0,
          activeIncidents: incidentsRes.count || 0,
        };

        const seoSnapshot = seoScore !== undefined ? { score: seoScore, previousScore: previousSeoScore } : null;

        const { error } = await supabase.from("nightly_summaries").upsert({
          org_id: org.id,
          period_start: periodStart,
          period_end: periodEnd,
          metrics_snapshot: metricsSnapshot,
          findings: allFindings,
          top_findings: topFindings,
          summary_text: summaryText,
          insights,
          suggested_actions: suggestedActions,
          seo_snapshot: seoSnapshot,
          generated_at: now.toISOString(),
        }, { onConflict: "org_id,period_end" });

        if (error) {
          console.error(`Error saving nightly summary for ${org.name}:`, error);
        } else {
          results.push(`Generated nightly summary for ${org.name}`);
        }
      } catch (orgErr) {
        console.error(`Error processing ${org.name}:`, orgErr);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("nightly-summary error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
