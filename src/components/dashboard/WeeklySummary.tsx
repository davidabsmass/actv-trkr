import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Sparkles, ExternalLink, Download, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PerformanceStatus = "strong" | "watch" | "risk";

function getStatus(sessionsChange: number, leadsChange: number): PerformanceStatus {
  if (leadsChange < -25 || sessionsChange < -25) return "risk";
  if (leadsChange < -10 || sessionsChange < -10) return "watch";
  return "strong";
}

const statusConfig: Record<PerformanceStatus, { label: string; emoji: string; bg: string; text: string }> = {
  strong: { label: "Strong", emoji: "🟢", bg: "bg-success/10", text: "text-success" },
  watch: { label: "Watch", emoji: "🟡", bg: "bg-warning/10", text: "text-warning" },
  risk: { label: "Risk", emoji: "🔴", bg: "bg-destructive/10", text: "text-destructive" },
};

export function WeeklySummary() {
  const { orgId } = useOrg();
  const navigate = useNavigate();

  const { data: summary } = useQuery({
    queryKey: ["weekly_summary", orgId],
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

  if (!summary) return null;

  const status = getStatus(Number(summary.sessions_change), Number(summary.leads_change));
  const config = statusConfig[status];

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Weekly Summary</h3>
        </div>
        <span className={`text-[11px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${config.bg} ${config.text}`}>
          {config.emoji} {config.label}
        </span>
      </div>

      {/* What Changed */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">What Changed</p>
        <p className="text-sm text-foreground/80 leading-relaxed">{summary.summary_text}</p>
      </div>

      {/* Risk Alert */}
      {summary.risk_alert && (
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg mb-4">
          <span className="text-sm">⚠️</span>
          <p className="text-xs text-foreground">{summary.risk_alert}</p>
        </div>
      )}

      {/* Next Action */}
      {summary.top_opportunity && (
        <div className="p-3 bg-success/5 border border-success/20 rounded-lg mb-4">
          <p className="text-[10px] uppercase tracking-wider text-success font-medium mb-1">Top Opportunity</p>
          <p className="text-xs text-foreground">{summary.top_opportunity}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> View Pages
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> View Sources
        </button>
        <button
          onClick={() => navigate("/exports")}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
        >
          <Download className="h-3 w-3" /> Download Leads
        </button>
        <button
          onClick={() => navigate("/reports")}
          className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
        >
          <FileText className="h-3 w-3" /> Create Report
        </button>
      </div>
    </div>
  );
}
