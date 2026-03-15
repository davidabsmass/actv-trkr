import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { Calendar, Sparkles, RefreshCw, Lightbulb, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";

export default function MonthlyTab() {
  const { orgId } = useOrg();
  const [aiResult, setAiResult] = useState<{ summary_paragraph?: string; focus_items?: string[] } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const thisMonth = startOfMonth(new Date());
  const lastMonth = startOfMonth(subMonths(new Date(), 1));
  const prevMonth = startOfMonth(subMonths(new Date(), 2));

  const { data: stored } = useQuery({
    queryKey: ["monthly_summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("monthly_summaries")
        .select("*")
        .eq("org_id", orgId)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle();
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
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "sessions").gte("date", monthStart).lte("date", monthEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "sessions").gte("date", prevStart).lte("date", prevEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads").gte("date", monthStart).lte("date", monthEnd),
        supabase.from("kpi_daily").select("value").eq("org_id", orgId).eq("metric", "leads").gte("date", prevStart).lte("date", prevEnd),
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

  const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);

  const generateAiSummary = async () => {
    if (!metrics) return;
    setLoadingAi(true);
    try {
      const findings = generateFindings(metrics as InsightInputs);
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings, report_type: "monthly" },
      });
      if (error) throw error;
      setAiResult(result);
    } catch {
      toast.error("Failed to generate monthly summary");
    } finally {
      setLoadingAi(false);
    }
  };

  const TrendBadge = ({ change }: { change: number }) => (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );

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
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {format(lastMonth, "MMMM yyyy")} in Review
            </h3>
          </div>
          <button onClick={generateAiSummary} disabled={loadingAi}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50">
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? "Generating…" : "AI Summary"}
          </button>
        </div>

        {summaryText ? (
          <div className="p-4 rounded-md bg-primary/5 border border-primary/10 mb-4">
            <p className="text-sm text-foreground/80 leading-relaxed">{summaryText}</p>
          </div>
        ) : (
          <div className="p-4 rounded-md bg-muted/50 mb-4">
            <p className="text-sm text-muted-foreground">Click "AI Summary" to generate an executive summary for this month.</p>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-3 rounded-md bg-muted/50">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Sessions</p>
            <p className="text-lg font-bold text-foreground">{metrics.currentSessions.toLocaleString()}</p>
            <TrendBadge change={pctChange(metrics.currentSessions, metrics.previousSessions)} />
          </div>
          <div className="p-3 rounded-md bg-muted/50">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Leads</p>
            <p className="text-lg font-bold text-foreground">{metrics.currentLeads.toLocaleString()}</p>
            <TrendBadge change={pctChange(metrics.currentLeads, metrics.previousLeads)} />
          </div>
          <div className="p-3 rounded-md bg-muted/50">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">CVR</p>
            <p className="text-lg font-bold text-foreground">{metrics.currentCvr}%</p>
            <TrendBadge change={pctChange(metrics.currentCvr, metrics.previousCvr)} />
          </div>
        </div>
      </div>

      {/* Focus Areas */}
      {focusItems && focusItems.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Recommended Focus This Month
          </h3>
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
