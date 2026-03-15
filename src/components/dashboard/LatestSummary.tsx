import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Sparkles, Clock } from "lucide-react";
import { Link } from "react-router-dom";

interface NightlySummary {
  id: string;
  generated_at: string;
  summary_text: string;
  insights: string[];
  suggested_actions: string[];
}

export function LatestSummary() {
  const { orgId } = useOrg();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard_nightly_summary", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("nightly_summaries")
        .select("id, generated_at, summary_text, insights, suggested_actions")
        .eq("org_id", orgId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as NightlySummary | null;
    },
    enabled: !!orgId,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/4 mb-4" />
        <div className="h-16 bg-muted rounded" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="glass-card p-6 animate-slide-up">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Latest Summary</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Insights will appear once enough data is collected. Check back soon.
        </p>
      </div>
    );
  }

  const insights = (summary.insights as string[]) || [];

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Latest Summary</h3>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {new Date(summary.generated_at).toLocaleDateString()}
          </span>
          <Link to="/reports" className="text-[10px] font-medium text-primary hover:underline ml-2">
            Full Report →
          </Link>
        </div>
      </div>
      {summary.summary_text && (
        <p className="text-sm text-foreground/80 leading-relaxed mb-3">{summary.summary_text}</p>
      )}
      {insights.length > 0 && (
        <ul className="space-y-1.5">
          {insights.slice(0, 3).map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
