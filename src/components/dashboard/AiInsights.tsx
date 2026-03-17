import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Lightbulb, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
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
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const hasFired = useRef(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setRateLimited(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "dashboard-ai-insights",
        { body: { metrics } }
      );
      if (fnError) {
        // Check for rate limit in the error
        if (fnError.message?.includes("429") || fnError.message?.includes("RATE_LIMITED")) {
          setRateLimited(true);
          toast.error("Daily AI insight limit reached. Try again tomorrow.");
          return;
        }
        throw fnError;
      }
      if (data?.error) {
        if (data.code === "RATE_LIMITED") {
          setRateLimited(true);
          toast.error(data.error);
          return;
        }
        throw new Error(data.error);
      }
      setInsights(data as InsightsData);
    } catch (e: any) {
      setError(e?.message || "Failed to generate insights");
      toast.error("Failed to generate AI insights");
    } finally {
      setIsLoading(false);
    }
  };

  if (error && !rateLimited) {
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
        </div>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : insights ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {isLoading ? "Generating…" : insights ? "Refresh" : "Generate Insights"}
        </button>
      </div>

      {rateLimited ? (
        <div className="p-4 rounded-md bg-warning/5 border border-warning/20">
          <p className="text-xs text-muted-foreground">Daily AI insight limit reached. Insights will be available again tomorrow.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : null}
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
