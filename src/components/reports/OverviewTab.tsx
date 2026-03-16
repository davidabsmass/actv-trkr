import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import {
  Eye, TrendingUp, TrendingDown, Minus, Users, Activity, Sparkles, RefreshCw,
  Lightbulb, Clock, Search, Database, Wifi, Calendar,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";
import { SummaryCard, InsightCard } from "./InsightCard";

type Period = "7d" | "weekly" | "monthly";

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${format(s, "MMM d")}–${format(e, "MMM d")}`;
}

interface NightlySummary {
  id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  metrics_snapshot: {
    sessions: { current: number; previous: number; change: number };
    leads: { current: number; previous: number; change: number };
    cvr: { current: number; previous: number; change: number };
    brokenLinks: number;
    activeIncidents: number;
  };
  top_findings: Array<{
    type: string; category: string; title: string; explanation: string;
    severity: string; positive: boolean; recommended_action?: string;
    metric_values: Record<string, number | string>;
  }>;
  summary_text: string;
  insights: string[];
  suggested_actions: string[];
  seo_snapshot: { score: number; previousScore?: number } | null;
}

// ── Period toggle pill ──
function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const options: { key: Period; label: string }[] = [
    { key: "7d", label: "7 Days" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
  ];
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
            value === o.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Shared TrendBadge ──
function TrendBadge({ change }: { change: number | null }) {
  if (change === null || change === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );
}

// ────────────────────────────────────────
// 7-Day view (original OverviewTab logic)
// ────────────────────────────────────────
function SevenDayView() {
  const { orgId } = useOrg();
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);

  const { data: nightlySummary, isLoading: nightlyLoading } = useQuery({
    queryKey: ["nightly_summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("nightly_summaries")
        .select("*")
        .eq("org_id", orgId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as NightlySummary | null;
    },
    enabled: !!orgId,
  });

  const now = new Date();
  const start = format(subDays(now, 7), "yyyy-MM-dd");
  const prevStart = format(subDays(now, 14), "yyyy-MM-dd");
  const prevEnd = format(subDays(now, 7), "yyyy-MM-dd");

  const { data: liveData, isLoading: liveLoading } = useQuery({
    queryKey: ["reports_overview_live", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const dayStart7 = `${start}T00:00:00Z`;
      const dayStart14 = `${prevStart}T00:00:00Z`;
      const dayEnd7 = `${prevEnd}T00:00:00Z`;
      const nowIso = new Date().toISOString();

      const [sessionsRes, prevSessionsRes, leadsRes, prevLeadsRes, brokenRes, incidentsRes] = await Promise.all([
        supabase.from("traffic_daily" as any).select("value").eq("org_id", orgId).eq("metric", "sessions_total").is("dimension", null).gte("date", start),
        supabase.from("traffic_daily" as any).select("value").eq("org_id", orgId).eq("metric", "sessions_total").is("dimension", null).gte("date", prevStart).lt("date", prevEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads_total").is("dimension", null).gte("date", start),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads_total").is("dimension", null).gte("date", prevStart).lt("date", prevEnd),
        supabase.from("broken_links").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("resolved_at", null),
      ]);
      const sum = (rows: any[] | null) => (rows || []).reduce((s, r) => s + Number(r.value || 0), 0);
      let currentSessions = sum(sessionsRes.data);
      let previousSessions = sum(prevSessionsRes.data);
      let currentLeads = sum(leadsRes.data);
      let previousLeads = sum(prevLeadsRes.data);

      if (currentSessions === 0 && currentLeads === 0) {
        const [rawSess, rawPrevSess, rawLeads, rawPrevLeads] = await Promise.all([
          supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", dayStart7).lte("started_at", nowIso),
          supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", dayStart14).lt("started_at", dayEnd7),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", dayStart7).lte("submitted_at", nowIso),
          supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", dayStart14).lt("submitted_at", dayEnd7),
        ]);
        currentSessions = rawSess.count || 0;
        previousSessions = rawPrevSess.count || 0;
        currentLeads = rawLeads.count || 0;
        previousLeads = rawPrevLeads.count || 0;
      }

      const currentCvr = currentSessions > 0 ? Math.round((currentLeads / currentSessions) * 10000) / 100 : 0;
      const previousCvr = previousSessions > 0 ? Math.round((previousLeads / previousSessions) * 10000) / 100 : 0;
      const inputs: InsightInputs = { currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr, brokenLinksCount: brokenRes.count || 0, activeIncidents: incidentsRes.count || 0 };
      return {
        currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr,
        brokenLinks: brokenRes.count || 0, activeIncidents: incidentsRes.count || 0,
        findings: generateFindings(inputs),
      };
    },
    enabled: !!orgId && (!nightlySummary || (nightlySummary.metrics_snapshot?.sessions?.current === 0 && nightlySummary.metrics_snapshot?.leads?.current === 0)),
  });

  const fetchAiSummaries = async () => {
    const findings = nightlySummary?.top_findings || liveData?.findings;
    if (!findings?.length) return;
    setLoadingAi(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings, report_type: "overview" },
      });
      if (error) throw error;
      const summaries: Record<string, string> = {};
      if (result?.card_summaries) {
        for (const cs of result.card_summaries) summaries[cs.type] = cs.summary;
      }
      if (result?.summary_paragraph) summaries._paragraph = result.summary_paragraph;
      setAiSummaries(summaries);
    } catch {
      toast.error("Failed to generate AI summaries");
    } finally {
      setLoadingAi(false);
    }
  };

  const nightlyHasZeroMetrics = nightlySummary && nightlySummary.metrics_snapshot?.sessions?.current === 0 && nightlySummary.metrics_snapshot?.leads?.current === 0;
  const isLoading = nightlyLoading || ((!nightlySummary || nightlyHasZeroMetrics) && liveLoading);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const nightlyHasData = !!nightlySummary && (nightlySummary.metrics_snapshot?.sessions?.current > 0 || nightlySummary.metrics_snapshot?.leads?.current > 0);
  const hasNightly = nightlyHasData;
  const metrics = hasNightly ? nightlySummary!.metrics_snapshot : null;
  const currentSessions = metrics?.sessions.current ?? liveData?.currentSessions ?? 0;
  const previousSessions = metrics?.sessions.previous ?? liveData?.previousSessions ?? 0;
  const currentLeads = metrics?.leads.current ?? liveData?.currentLeads ?? 0;
  const previousLeads = metrics?.leads.previous ?? liveData?.previousLeads ?? 0;
  const currentCvr = metrics?.cvr.current ?? liveData?.currentCvr ?? 0;
  const previousCvr = metrics?.cvr.previous ?? liveData?.previousCvr ?? 0;
  const brokenLinks = metrics?.brokenLinks ?? liveData?.brokenLinks ?? 0;
  const activeIncidents = metrics?.activeIncidents ?? liveData?.activeIncidents ?? 0;

  const sessionsPct = pctChange(currentSessions, previousSessions);
  const leadsPct = pctChange(currentLeads, previousLeads);
  const cvrPct = pctChange(currentCvr, previousCvr);

  const findings = hasNightly ? (nightlySummary.top_findings || []) : (liveData?.findings || []);
  const negativeFindings = findings.filter((f: any) => !f.positive).slice(0, 5);
  const positiveFindings = findings.filter((f: any) => f.positive).slice(0, 5);

  const currentRange = hasNightly
    ? formatRange(nightlySummary.period_start, nightlySummary.period_end)
    : formatRange(start, format(now, "yyyy-MM-dd"));
  const previousRange = hasNightly ? null : formatRange(prevStart, prevEnd);
  const dataSource = hasNightly ? "Cached summary" : "Live";

  if (!hasNightly && !liveData) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">ACTV TRKR is collecting activity data. Insights will appear once enough data is available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasNightly && nightlySummary.summary_text && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Latest Summary</h3>
            <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(nightlySummary.generated_at), "MMM d 'at' h:mm a")}
              {" · "}Covering {formatRange(nightlySummary.period_start, nightlySummary.period_end)}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{nightlySummary.summary_text}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] text-muted-foreground">
            {currentRange}{previousRange ? ` vs ${previousRange}` : " (7d)"}
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5">
            {hasNightly ? <Database className="h-2.5 w-2.5" /> : <Wifi className="h-2.5 w-2.5" />}
            {dataSource}
          </span>
          {!hasNightly && (
            <button onClick={fetchAiSummaries} disabled={loadingAi}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50 ml-auto">
              {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {loadingAi ? "Generating…" : "AI Summaries"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Traffic (7d)" value={currentSessions.toLocaleString()} change={sessionsPct} changeLabel="vs prior 7 days" summary={aiSummaries.traffic_up || aiSummaries.traffic_down} />
          <SummaryCard label="Leads (7d)" value={currentLeads.toLocaleString()} change={leadsPct} changeLabel="vs prior 7 days" summary={aiSummaries.lead_growth || aiSummaries.lead_drop} />
          <SummaryCard label="CVR (7d)" value={`${currentCvr}%`} change={cvrPct} changeLabel="vs prior 7 days" summary={aiSummaries.conversion_gain || aiSummaries.conversion_drop} />
          <SummaryCard label="Site Health" value={activeIncidents > 0 ? `${activeIncidents} issues` : "Healthy"} summary={brokenLinks > 5 ? `${brokenLinks} broken links detected.` : undefined} />
        </div>
      </div>

      {hasNightly && nightlySummary.insights && nightlySummary.insights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Key Insights</h3>
          <div className="space-y-2">
            {nightlySummary.insights.map((insight: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                <span className="text-xs font-bold text-primary mt-0.5 flex-shrink-0">{i + 1}.</span>
                <p className="text-sm text-foreground">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasNightly && findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Key Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {findings.slice(0, 4).map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}
          </div>
        </div>
      )}

      {negativeFindings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-destructive" /> Needs Attention</h3>
          <div className="space-y-2">{negativeFindings.map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}</div>
        </div>
      )}

      {positiveFindings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-success" /> What's Working</h3>
          <div className="space-y-2">{positiveFindings.map((f: any, i: number) => (<InsightCard key={i} finding={f} />))}</div>
        </div>
      )}

      {hasNightly && nightlySummary.suggested_actions && nightlySummary.suggested_actions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> Suggested Actions</h3>
          <div className="space-y-2">
            {nightlySummary.suggested_actions.map((action: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <span className="text-xs font-bold text-primary mt-0.5 flex-shrink-0">{i + 1}.</span>
                <p className="text-sm text-foreground">{action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasNightly && nightlySummary.seo_snapshot && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> SEO Overview</h3>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{nightlySummary.seo_snapshot.score}</div>
              <div className="text-[10px] uppercase text-muted-foreground">SEO Score</div>
            </div>
            {nightlySummary.seo_snapshot.previousScore !== undefined && (
              <div className="text-sm text-muted-foreground">
                {nightlySummary.seo_snapshot.score > nightlySummary.seo_snapshot.previousScore
                  ? `↑ Improved from ${nightlySummary.seo_snapshot.previousScore}`
                  : nightlySummary.seo_snapshot.score < nightlySummary.seo_snapshot.previousScore
                    ? `↓ Declined from ${nightlySummary.seo_snapshot.previousScore}`
                    : `→ Unchanged from ${nightlySummary.seo_snapshot.previousScore}`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Weekly view (inline, not separate tab)
// ────────────────────────────────────────
function WeeklyView() {
  const { orgId } = useOrg();
  const [isHydrating, setIsHydrating] = useState(false);
  const [attemptedHydration, setAttemptedHydration] = useState(false);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["weekly_summary_reports", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = (await supabase
        .from("weekly_summaries")
        .select("*")
        .eq("org_id", orgId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle()) as { data: any; error: any };
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const hydrateWeeklySummary = async (silent = false) => {
    if (!orgId || isHydrating) return;
    setIsHydrating(true);
    try {
      const { error } = await supabase.functions.invoke("weekly-summary", {
        body: { org_id: orgId, source: "reports_weekly_view" },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("Failed to hydrate weekly summary", error);
      if (!silent) toast.error("Could not generate weekly summary. Please try again.");
    } finally {
      setIsHydrating(false);
    }
  };

  useEffect(() => {
    if (!orgId || isLoading || summary || attemptedHydration || isHydrating) return;
    setAttemptedHydration(true);
    void hydrateWeeklySummary(true);
  }, [orgId, isLoading, summary, attemptedHydration, isHydrating]);

  const metrics = (summary?.conversion_anomalies ?? {}) as Record<string, number | string | null | undefined>;
  const sessionsCurrent = Number(metrics.sessions_current ?? 0);
  const leadsCurrent = Number(metrics.leads_current ?? 0);
  const cvrCurrent = Number(metrics.cvr_current ?? 0);
  const cvrChange = Number(metrics.cvr_change ?? 0);

  if (isLoading || isHydrating) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No weekly summary available yet.</p>
        <button onClick={() => void hydrateWeeklySummary(false)} disabled={isHydrating}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${isHydrating ? "animate-spin" : ""}`} /> Generate Weekly Summary
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary banner */}
      {summary.summary_text && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Weekly Summary</h3>
            <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Week of {format(new Date(summary.week_start), "MMM d, yyyy")}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{summary.summary_text}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Sessions" value={sessionsCurrent.toLocaleString()} change={Number(summary.sessions_change?.toFixed?.(0) ?? summary.sessions_change ?? 0)} changeLabel="vs prior week" />
        <SummaryCard label="Leads" value={leadsCurrent.toLocaleString()} change={Number(summary.leads_change?.toFixed?.(0) ?? summary.leads_change ?? 0)} changeLabel="vs prior week" />
        <SummaryCard label="CVR" value={`${cvrCurrent}%`} change={cvrChange} changeLabel="vs prior week" />
        <SummaryCard label="Top Source" value={(metrics.top_source as string) || "—"} />
      </div>

      {/* Risk / Opportunity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.risk_alert && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-[10px] uppercase tracking-wider text-destructive font-medium mb-1">⚠️ Risk Alert</p>
            <p className="text-sm text-foreground">{summary.risk_alert}</p>
          </div>
        )}
        {summary.top_opportunity && (
          <div className="rounded-lg border border-success/20 bg-success/5 p-4">
            <p className="text-[10px] uppercase tracking-wider text-success font-medium mb-1">🟢 Top Opportunity</p>
            <p className="text-sm text-foreground">{summary.top_opportunity}</p>
          </div>
        )}
      </div>

      {/* Next Steps */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> Recommended Next Steps</h3>
        <div className="space-y-2">
          {Number(summary.leads_change) < -10 && (
            <div className="flex items-start gap-2 text-sm"><span className="text-xs font-bold text-primary mt-0.5">1.</span><p className="text-foreground">Review top lead sources for any declines or attribution changes.</p></div>
          )}
          {Number(summary.sessions_change) > 10 && Number(summary.leads_change) < 5 && (
            <div className="flex items-start gap-2 text-sm"><span className="text-xs font-bold text-primary mt-0.5">2.</span><p className="text-foreground">Traffic grew but leads didn't keep pace — check conversion paths on top landing pages.</p></div>
          )}
          <div className="flex items-start gap-2 text-sm"><span className="text-xs font-bold text-primary mt-0.5">•</span><p className="text-foreground">Review the 7-day view for detailed insights and suggested actions.</p></div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Monthly view (inline, not separate tab)
// ────────────────────────────────────────
function MonthlyView() {
  const { orgId } = useOrg();
  const [aiResult, setAiResult] = useState<{ summary_paragraph?: string; focus_items?: string[] } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const lastMonth = startOfMonth(subMonths(new Date(), 1));
  const prevMonth = startOfMonth(subMonths(new Date(), 2));

  const { data: stored } = useQuery({
    queryKey: ["monthly_summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from("monthly_summaries").select("*").eq("org_id", orgId).order("month", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  const { data: metrics } = useQuery({
    queryKey: ["monthly_metrics", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const monthStart = format(lastMonth, "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(lastMonth), "yyyy-MM-dd");
      const prevStart = format(prevMonth, "yyyy-MM-dd");
      const prevEnd = format(endOfMonth(prevMonth), "yyyy-MM-dd");

      const [sessRes, prevSessRes, leadsRes, prevLeadsRes] = await Promise.all([
        supabase.from("traffic_daily" as any).select("value").eq("org_id", orgId).eq("metric", "sessions_total").is("dimension", null).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("traffic_daily" as any).select("value").eq("org_id", orgId).eq("metric", "sessions_total").is("dimension", null).gte("date", prevStart).lte("date", prevEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads_total").is("dimension", null).gte("date", monthStart).lte("date", monthEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads_total").is("dimension", null).gte("date", prevStart).lte("date", prevEnd),
      ]);

      const sum = (rows: any[]) => (rows || []).reduce((s, r) => s + Number(r.value || 0), 0);
      const currentSessions = sum(sessRes.data || []);
      const previousSessions = sum(prevSessRes.data || []);
      const currentLeads = sum(leadsRes.data || []);
      const previousLeads = sum(prevLeadsRes.data || []);
      const currentCvr = currentSessions > 0 ? Math.round((currentLeads / currentSessions) * 10000) / 100 : 0;
      const previousCvr = previousSessions > 0 ? Math.round((previousLeads / previousSessions) * 10000) / 100 : 0;

      return { currentSessions, previousSessions, currentLeads, previousLeads, currentCvr, previousCvr };
    },
    enabled: !!orgId,
  });

  const generateAiSummary = async () => {
    if (!metrics) return;
    setLoadingAi(true);
    try {
      const findings = generateFindings(metrics as InsightInputs);
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", { body: { findings, report_type: "monthly" } });
      if (error) throw error;
      setAiResult(result);
    } catch { toast.error("Failed to generate monthly summary"); } finally { setLoadingAi(false); }
  };

  if (!metrics) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">Not enough data yet to generate a monthly summary.</p>
      </div>
    );
  }

  const summaryText = aiResult?.summary_paragraph || stored?.summary_text;
  const focusItems = aiResult?.focus_items || (stored?.focus_areas as string[] | null);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">{format(lastMonth, "MMMM yyyy")} in Review</h3>
          </div>
          <button onClick={generateAiSummary} disabled={loadingAi}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50">
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? "Generating…" : "AI Summary"}
          </button>
        </div>
        {summaryText ? (
          <p className="text-sm text-foreground/80 leading-relaxed">{summaryText}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Click "AI Summary" to generate an executive summary for this month.</p>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SummaryCard label="Sessions" value={metrics.currentSessions.toLocaleString()} change={pctChange(metrics.currentSessions, metrics.previousSessions)} changeLabel="vs prior month" />
        <SummaryCard label="Leads" value={metrics.currentLeads.toLocaleString()} change={pctChange(metrics.currentLeads, metrics.previousLeads)} changeLabel="vs prior month" />
        <SummaryCard label="CVR" value={`${metrics.currentCvr}%`} change={pctChange(metrics.currentCvr, metrics.previousCvr)} changeLabel="vs prior month" />
      </div>

      {/* Focus Areas */}
      {focusItems && focusItems.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> Recommended Focus This Month</h3>
          <div className="space-y-2">
            {focusItems.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
                <span className="text-xs font-bold text-primary mt-0.5">{i + 1}.</span>
                <p className="text-sm text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────
// Main export — unified with period toggle
// ────────────────────────────────────────
export default function OverviewTab({ period, onPeriodChange }: { period?: Period; onPeriodChange?: (p: Period) => void }) {
  const [localPeriod, setLocalPeriod] = useState<Period>("7d");
  const activePeriod = period ?? localPeriod;
  const setPeriod = onPeriodChange ?? setLocalPeriod;

  return (
    <div className="space-y-6">
      {/* At a Glance header with inline period toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" /> At a Glance
        </h3>
        <PeriodToggle value={activePeriod} onChange={setPeriod} />
      </div>

      {/* Render the active period view */}
      {activePeriod === "7d" && <SevenDayView />}
      {activePeriod === "weekly" && <WeeklyView />}
      {activePeriod === "monthly" && <MonthlyView />}
    </div>
  );
}
