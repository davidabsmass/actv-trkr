import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { format, startOfWeek, subWeeks } from "date-fns";

export function WeeklySummary() {
  const { orgId } = useOrg();

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

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">AI Weekly Summary</h3>
        <span className="text-[10px] uppercase tracking-wider font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
          AI
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Sessions</p>
          <div className="flex items-center gap-1.5">
            {Number(summary.sessions_change) >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 kpi-up" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 kpi-down" />
            )}
            <span className={`text-sm font-semibold font-mono-data ${Number(summary.sessions_change) >= 0 ? "kpi-up" : "kpi-down"}`}>
              {Number(summary.sessions_change) >= 0 ? "+" : ""}{Number(summary.sessions_change).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Leads</p>
          <div className="flex items-center gap-1.5">
            {Number(summary.leads_change) >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 kpi-up" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 kpi-down" />
            )}
            <span className={`text-sm font-semibold font-mono-data ${Number(summary.leads_change) >= 0 ? "kpi-up" : "kpi-down"}`}>
              {Number(summary.leads_change) >= 0 ? "+" : ""}{Number(summary.leads_change).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {summary.risk_alert && (
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg mb-3">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-xs text-foreground">{summary.risk_alert}</p>
        </div>
      )}

      <p className="text-sm text-foreground/80 leading-relaxed">{summary.summary_text}</p>

      {summary.top_opportunity && (
        <div className="mt-3 p-3 bg-success/5 border border-success/20 rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-success font-medium mb-1">Top Opportunity</p>
          <p className="text-xs text-foreground">{summary.top_opportunity}</p>
        </div>
      )}
    </div>
  );
}
