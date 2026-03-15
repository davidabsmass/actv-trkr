import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { subDays, format } from "date-fns";
import { Eye, TrendingUp, Users, Activity, Sparkles, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";
import { SummaryCard, InsightCard } from "./InsightCard";

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export default function OverviewTab() {
  const { orgId } = useOrg();
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);

  const now = new Date();
  const start = format(subDays(now, 7), "yyyy-MM-dd");
  const prevStart = format(subDays(now, 14), "yyyy-MM-dd");
  const prevEnd = format(subDays(now, 7), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["reports_overview", orgId],
    queryFn: async () => {
      if (!orgId) return null;

      const [sessionsRes, prevSessionsRes, leadsRes, prevLeadsRes, brokenRes, incidentsRes] = await Promise.all([
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "sessions").gte("date", start),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "sessions").gte("date", prevStart).lt("date", prevEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads").gte("date", start),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads").gte("date", prevStart).lt("date", prevEnd),
        supabase.from("broken_links").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("resolved_at", null),
      ]);

      const sum = (rows: any[] | null) => (rows || []).reduce((s, r) => s + Number(r.value || 0), 0);
      const currentSessions = sum(sessionsRes.data);
      const previousSessions = sum(prevSessionsRes.data);
      const currentLeads = sum(leadsRes.data);
      const previousLeads = sum(prevLeadsRes.data);
      const currentCvr = currentSessions > 0 ? Math.round((currentLeads / currentSessions) * 10000) / 100 : 0;
      const previousCvr = previousSessions > 0 ? Math.round((previousLeads / previousSessions) * 10000) / 100 : 0;

      const inputs: InsightInputs = {
        currentSessions, previousSessions,
        currentLeads, previousLeads,
        currentCvr, previousCvr,
        brokenLinksCount: brokenRes.count || 0,
        activeIncidents: incidentsRes.count || 0,
      };

      return {
        currentSessions, previousSessions,
        currentLeads, previousLeads,
        currentCvr, previousCvr,
        brokenLinks: brokenRes.count || 0,
        activeIncidents: incidentsRes.count || 0,
        findings: generateFindings(inputs),
      };
    },
    enabled: !!orgId,
  });

  const fetchAiSummaries = async () => {
    if (!data?.findings.length) return;
    setLoadingAi(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings: data.findings, report_type: "overview" },
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

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">Not enough data yet to generate an overview.</p>
        <p className="text-xs text-muted-foreground mt-1">Insights will appear once activity data has been collected.</p>
      </div>
    );
  }

  const sessionsPct = pctChange(data.currentSessions, data.previousSessions);
  const leadsPct = pctChange(data.currentLeads, data.previousLeads);
  const cvrPct = pctChange(data.currentCvr, data.previousCvr);

  const negativeFindings = data.findings.filter(f => !f.positive).slice(0, 5);
  const positiveFindings = data.findings.filter(f => f.positive).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* At a Glance */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> At a Glance
          </h3>
          <button
            onClick={fetchAiSummaries}
            disabled={loadingAi}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? "Generating…" : "AI Summaries"}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Traffic" value={data.currentSessions.toLocaleString()} change={sessionsPct} summary={aiSummaries.traffic_up || aiSummaries.traffic_down} />
          <SummaryCard label="Leads" value={data.currentLeads.toLocaleString()} change={leadsPct} summary={aiSummaries.lead_growth || aiSummaries.lead_drop} />
          <SummaryCard label="Conversion" value={`${data.currentCvr}%`} change={cvrPct} summary={aiSummaries.conversion_gain || aiSummaries.conversion_drop} />
          <SummaryCard label="Site Health" value={data.activeIncidents > 0 ? `${data.activeIncidents} issues` : "Healthy"} summary={data.brokenLinks > 5 ? `${data.brokenLinks} broken links detected.` : undefined} />
        </div>
      </div>

      {/* Key Insights */}
      {data.findings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Key Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.findings.slice(0, 4).map((f, i) => (
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
            {negativeFindings.map((f, i) => (
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
            {positiveFindings.map((f, i) => (
              <InsightCard key={i} finding={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
