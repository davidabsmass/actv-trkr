import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Lightbulb, RefreshCw, Sparkles, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface AiInsightsProps {
  metrics: {
    sessionsThisWeek: number;
    sessionsLastWeek: number;
    leadsThisWeek: number;
    leadsLastWeek: number;
    cvrThisWeek: number;
    cvrLastWeek: number;
    topPage?: string;
    topSource?: string;
    totalForms: number;
    primaryFocus: string;
  };
}

interface Suggestion {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface InsightsData {
  summary: string;
  suggestions: Suggestion[];
}

const priorityConfig = {
  high: { bg: "bg-destructive/8", border: "border-destructive/20", dot: "bg-destructive" },
  medium: { bg: "bg-warning/8", border: "border-warning/20", dot: "bg-warning" },
  low: { bg: "bg-primary/8", border: "border-primary/20", dot: "bg-primary" },
};

export function AiInsights({ metrics }: AiInsightsProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  // Stable key from metrics to avoid refetching on every render
  const metricsKey = useMemo(
    () =>
      `${metrics.sessionsThisWeek}-${metrics.leadsThisWeek}-${metrics.cvrThisWeek.toFixed(4)}-${refreshKey}`,
    [metrics.sessionsThisWeek, metrics.leadsThisWeek, metrics.cvrThisWeek, refreshKey]
  );

  const {
    data: insights,
    isLoading,
    error,
    isFetching,
  } = useQuery<InsightsData>({
    queryKey: ["ai_dashboard_insights", metricsKey],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "dashboard-ai-insights",
        { body: { metrics } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as InsightsData;
    },
    staleTime: 5 * 60 * 1000, // cache 5 min
    retry: 1,
  });

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    toast.info("Refreshing AI insights…");
  };

  if (error) {
    return (
      <div className="glass-card p-5 animate-slide-up">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs">AI insights unavailable right now</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Performance Insights</h3>
          <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            Live
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          title="Refresh insights"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading || !insights ? (
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="mb-5">
            <p className="text-sm text-foreground/85 leading-relaxed">{insights.summary}</p>
          </div>

          {/* Suggestions */}
          {insights.suggestions && insights.suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Recommended Actions
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {insights.suggestions.map((s, i) => {
                  const config = priorityConfig[s.priority];
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${config.bg} ${config.border} transition-colors`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        <span className="text-xs font-semibold text-foreground">{s.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {s.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
