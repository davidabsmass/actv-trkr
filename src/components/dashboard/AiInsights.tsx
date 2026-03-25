import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Lightbulb, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
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

const STORAGE_KEY = "actv_ai_insights";
const AUTO_LIMIT = 5;
const MANUAL_LIMIT = 10;
const TOTAL_LIMIT = AUTO_LIMIT + MANUAL_LIMIT; // 15

interface StoredInsights {
  data: InsightsData;
  autoCount: number;
  manualCount: number;
  day: string; // YYYY-MM-DD to reset daily
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadStored(): StoredInsights | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredInsights;
    // Reset if it's a new day
    if (parsed.day !== getTodayKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(stored: StoredInsights) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch { /* ignore */ }
}

export function AiInsights({ metrics }: AiInsightsProps) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [autoCount, setAutoCount] = useState(0);
  const [manualCount, setManualCount] = useState(0);
  const [phase, setPhase] = useState<"auto" | "manual" | "exhausted">("auto");
  const hasFired = useRef(false);

  // Load cached state on mount
  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setInsights(stored.data);
      setAutoCount(stored.autoCount);
      setManualCount(stored.manualCount);
      const totalUsed = stored.autoCount + stored.manualCount;
      if (totalUsed >= TOTAL_LIMIT) {
        setPhase("exhausted");
      } else if (stored.autoCount >= AUTO_LIMIT) {
        setPhase("manual");
      } else {
        setPhase("auto");
      }
    }
  }, []);

  const callAI = useCallback(async (isAuto: boolean): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    setRateLimited(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "dashboard-ai-insights",
        { body: { metrics } }
      );
      if (fnError) {
        if (fnError.message?.includes("429") || fnError.message?.includes("RATE_LIMITED")) {
          setRateLimited(true);
          setPhase("exhausted");
          return false;
        }
        throw fnError;
      }
      if (data?.error) {
        if (data.code === "RATE_LIMITED" || data.rate_limited) {
          setRateLimited(true);
          setPhase("exhausted");
          return false;
        }
        throw new Error(data.error);
      }

      const insightsData = data as InsightsData;
      setInsights(insightsData);

      // Update counts
      const newAuto = isAuto ? autoCount + 1 : autoCount;
      const newManual = !isAuto ? manualCount + 1 : manualCount;
      setAutoCount(newAuto);
      setManualCount(newManual);

      const totalUsed = newAuto + newManual;
      if (totalUsed >= TOTAL_LIMIT) {
        setPhase("exhausted");
      } else if (newAuto >= AUTO_LIMIT) {
        setPhase("manual");
      }

      saveStored({
        data: insightsData,
        autoCount: newAuto,
        manualCount: newManual,
        day: getTodayKey(),
      });

      return true;
    } catch (e: any) {
      setError(e?.message || "Failed to generate insights");
      toast.error("Failed to generate AI insights");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [metrics, autoCount, manualCount]);

  // Auto-generate on mount if under auto limit and no cached data for this visit
  useEffect(() => {
    if (hasFired.current) return;
    if (metrics.sessionsThisWeek === undefined) return;
    hasFired.current = true;

    const stored = loadStored();
    if (stored) {
      // Already have cached insights — only auto-fire if under auto limit
      if (stored.autoCount < AUTO_LIMIT && (stored.autoCount + stored.manualCount) < TOTAL_LIMIT) {
        callAI(true);
      }
      // Otherwise just show the cached data (already loaded above)
      return;
    }

    // No cache — first visit of the day, auto-generate
    callAI(true);
  }, [metrics.sessionsThisWeek]);

  const handleManualRefresh = () => {
    if (phase === "exhausted") {
      toast("You've used all your AI insights for today. They'll refresh tomorrow!", {
        icon: "☕",
      });
      return;
    }
    callAI(false);
  };

  const remainingManual = Math.max(0, MANUAL_LIMIT - manualCount);
  const totalUsed = autoCount + manualCount;

  if (error && !rateLimited && !insights) {
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Performance Insights</h3>
        </div>
        
        {/* Show refresh button once auto phase is done */}
        {phase === "manual" && (
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {isLoading ? "Generating…" : `Refresh (${remainingManual} left)`}
          </button>
        )}

        {phase === "exhausted" && insights && (
          <span className="text-xs text-muted-foreground/60 font-medium">
            Refreshes again tomorrow
          </span>
        )}
      </div>

      {phase === "exhausted" && !insights ? (
        <div className="p-4 rounded-md bg-muted/30 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary/60" />
            <span className="text-xs font-medium text-foreground">All caught up!</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You've used all your AI insights for today. Fresh insights will be ready for you tomorrow morning. ☕
          </p>
        </div>
      ) : isLoading && !insights ? (
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : insights ? (
        <>
          {isLoading && (
             <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
               <RefreshCw className="h-3 w-3 animate-spin" />
               Refreshing insights…
            </div>
          )}
          <div className="mb-5">
            <p className="text-sm text-foreground/85 leading-relaxed">{insights.summary}</p>
          </div>
          {insights.suggestions && insights.suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Recommended Actions
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {insights.suggestions.map((s, i) => {
                  const config = priorityConfig[s.priority];
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-4 ${config.bg} ${config.border} transition-colors`}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                        <span className="text-sm font-semibold text-foreground">{s.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {s.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
