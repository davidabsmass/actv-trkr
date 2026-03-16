import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, format } from "date-fns";
import {
  Eye, TrendingUp, Users, Activity, Sparkles, RefreshCw,
  Lightbulb, Clock, Search,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";
import { SummaryCard, InsightCard } from "./InsightCard";

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
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

export default function OverviewTab() {
  const { orgId } = useOrg();
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);

  // Fetch latest nightly summary (cached)
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

  // Fallback: compute live if no nightly summary exists
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

      // Fallback to raw counts if aggregated tables are empty/zero
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

  // Use nightly summary only if it has non-zero metrics (zero means aggregation failed)
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

  if (!hasNightly && !liveData) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">ACTV TRKR is collecting activity data. Insights will appear once enough data is available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Nightly Summary Banner */}
      {hasNightly && nightlySummary.summary_text && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Latest Summary</h3>
            <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(nightlySummary.generated_at), "MMM d 'at' h:mm a")}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{nightlySummary.summary_text}</p>
        </div>
      )}

      {/* At a Glance */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> At a Glance
          </h3>
          {!hasNightly && (
            <button
              onClick={fetchAiSummaries}
              disabled={loadingAi}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {loadingAi ? "Generating…" : "AI Summaries"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Traffic" value={currentSessions.toLocaleString()} change={sessionsPct}
            summary={aiSummaries.traffic_up || aiSummaries.traffic_down} />
          <SummaryCard label="Leads" value={currentLeads.toLocaleString()} change={leadsPct}
            summary={aiSummaries.lead_growth || aiSummaries.lead_drop} />
          <SummaryCard label="Conversion" value={`${currentCvr}%`} change={cvrPct}
            summary={aiSummaries.conversion_gain || aiSummaries.conversion_drop} />
          <SummaryCard label="Site Health"
            value={activeIncidents > 0 ? `${activeIncidents} issues` : "Healthy"}
            summary={brokenLinks > 5 ? `${brokenLinks} broken links detected.` : undefined} />
        </div>
      </div>

      {/* Key Insights from nightly summary */}
      {hasNightly && nightlySummary.insights && nightlySummary.insights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Key Insights
          </h3>
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

      {/* Fallback: show finding cards if no nightly insights */}
      {!hasNightly && findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Key Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {findings.slice(0, 4).map((f: any, i: number) => (
              <InsightCard key={i} finding={f} />
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {negativeFindings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-destructive" /> Needs Attention
          </h3>
          <div className="space-y-2">
            {negativeFindings.map((f: any, i: number) => (
              <InsightCard key={i} finding={f} />
            ))}
          </div>
        </div>
      )}

      {/* What's Working */}
      {positiveFindings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-success" /> What's Working
          </h3>
          <div className="space-y-2">
            {positiveFindings.map((f: any, i: number) => (
              <InsightCard key={i} finding={f} />
            ))}
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {hasNightly && nightlySummary.suggested_actions && nightlySummary.suggested_actions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Suggested Actions
          </h3>
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

      {/* SEO Snapshot */}
      {hasNightly && nightlySummary.seo_snapshot && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> SEO Overview
          </h3>
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
