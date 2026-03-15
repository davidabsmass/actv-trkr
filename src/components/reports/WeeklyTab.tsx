import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";
import { Calendar, TrendingUp, TrendingDown, Minus, Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";

function TrendBadge({ change }: { change: number | null }) {
  if (change === null || change === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}{change}%
    </span>
  );
}

export default function WeeklyTab() {
  const { orgId } = useOrg();
  const [aiParagraph, setAiParagraph] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["weekly_summary_reports", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("weekly_summaries")
        .select("*")
        .eq("org_id", orgId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const generateAiSummary = async () => {
    if (!summary) return;
    setLoadingAi(true);
    try {
      const inputs: InsightInputs = {
        currentSessions: Number(summary.sessions_current || 0),
        previousSessions: Number(summary.sessions_previous || 0),
        currentLeads: Number(summary.leads_current || 0),
        previousLeads: Number(summary.leads_previous || 0),
        currentCvr: Number(summary.cvr_current || 0),
        previousCvr: Number(summary.cvr_previous || 0),
      };
      const findings = generateFindings(inputs);
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings, report_type: "weekly" },
      });
      if (error) throw error;
      setAiParagraph(result?.summary_paragraph || null);
    } catch {
      toast.error("Failed to generate weekly summary");
    } finally {
      setLoadingAi(false);
    }
  };

  if (!summary) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">Not enough data yet to generate a weekly summary.</p>
        <p className="text-xs text-muted-foreground mt-1">We're still gathering enough activity to identify meaningful trends.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Week of {format(new Date(summary.week_start), "MMM d, yyyy")}
            </h3>
          </div>
          <button
            onClick={generateAiSummary}
            disabled={loadingAi}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? "Generating…" : "AI Summary"}
          </button>
        </div>

        {/* AI or stored summary */}
        <div className="p-4 rounded-md bg-primary/5 border border-primary/10 mb-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            {aiParagraph || summary.summary_text || "Generate an AI summary to see a plain-English recap of this week."}
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Sessions", value: summary.sessions_current, change: Number(summary.sessions_change) },
            { label: "Leads", value: summary.leads_current, change: Number(summary.leads_change) },
            { label: "CVR", value: `${summary.cvr_current}%`, change: Number(summary.cvr_change) },
            { label: "Top Source", value: summary.top_source || "—", change: null },
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">{m.label}</p>
              <p className="text-lg font-bold text-foreground">{m.value}</p>
              <TrendBadge change={m.change} />
            </div>
          ))}
        </div>
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

      {/* Recommended Next Steps */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" /> Recommended Next Steps
        </h3>
        <div className="space-y-2">
          {Number(summary.leads_change) < -10 && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-xs font-bold text-primary mt-0.5">1.</span>
              <p className="text-foreground">Review top lead sources for any declines or attribution changes.</p>
            </div>
          )}
          {Number(summary.sessions_change) > 10 && Number(summary.leads_change) < 5 && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-xs font-bold text-primary mt-0.5">2.</span>
              <p className="text-foreground">Traffic grew but leads didn't keep pace — check conversion paths on top landing pages.</p>
            </div>
          )}
          <div className="flex items-start gap-2 text-sm">
            <span className="text-xs font-bold text-primary mt-0.5">•</span>
            <p className="text-foreground">Review the Overview tab for detailed insights and suggested actions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
