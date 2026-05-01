import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import robotAvatar from "@/assets/robot-avatar.png";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface AiInsightsProps {
  metrics: {
    sessionsThisWeek: number;
    sessionsLastWeek: number;
    leadsThisWeek: number;
    leadsLastWeek: number;
    cvrThisWeek: number;
    cvrLastWeek: number;
    keyActionsThisWeek?: number;
    keyActionsLastWeek?: number;
    topPage?: string;
    topSource?: string;
    totalForms: number;
    primaryFocus: string;
  };
  orgId?: string | null;
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

const AUTO_LIMIT = 1;
const MANUAL_LIMIT = 10;
const TOTAL_LIMIT = AUTO_LIMIT + MANUAL_LIMIT;

function getStorageKey(orgId?: string | null) {
  return `actv_ai_insights_${orgId || "default"}`;
}

interface StoredInsights {
  data: InsightsData;
  autoCount: number;
  manualCount: number;
  day: string;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadStored(orgId?: string | null): StoredInsights | null {
  try {
    const raw = sessionStorage.getItem(getStorageKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredInsights;
    if (parsed.day !== getTodayKey()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(orgId: string | null | undefined, stored: StoredInsights) {
  try {
    sessionStorage.setItem(getStorageKey(orgId), JSON.stringify(stored));
  } catch { /* ignore */ }
}

export function AiInsights({ metrics, orgId }: AiInsightsProps) {
  const { t } = useTranslation();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [autoCount, setAutoCount] = useState(0);
  const [manualCount, setManualCount] = useState(0);
  const [phase, setPhase] = useState<"auto" | "manual" | "exhausted">("auto");
  const hasFired = useRef(false);

  useEffect(() => {
    const stored = loadStored(orgId);
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
  }, [orgId]);

  const callAI = useCallback(async (isAuto: boolean): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    setRateLimited(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        setError("Session expired – please sign in again.");
        setIsLoading(false);
        return false;
      }
      const { data, error: fnError } = await supabase.functions.invoke(
        "dashboard-ai-insights",
        { body: { metrics, orgId } }
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

      saveStored(orgId, {
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
  }, [metrics, autoCount, manualCount, orgId]);

  useEffect(() => {
    if (hasFired.current) return;
    if (metrics.sessionsThisWeek === undefined) return;
    hasFired.current = true;

    const stored = loadStored(orgId);
    if (stored) {
      if (stored.autoCount < AUTO_LIMIT && (stored.autoCount + stored.manualCount) < TOTAL_LIMIT) {
        callAI(true);
      }
      return;
    }

    callAI(true);
  }, [metrics.sessionsThisWeek]);

  const handleManualRefresh = () => {
    if (phase === "exhausted") {
      toast(t("dashboard.usedAllInsights"), { icon: "☕" });
      return;
    }
    callAI(false);
  };

  const remainingManual = Math.max(0, MANUAL_LIMIT - manualCount);

  if (error && !rateLimited && !insights) {
    return (
      <div className="glass-card p-5 animate-slide-up">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs">{t("dashboard.aiInsightsUnavailable")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <img src={robotAvatar} alt="AI" className="h-10 w-10 rounded-full object-cover" />
          <h3 className="text-sm font-semibold text-foreground">{t("dashboard.aiInsights")}</h3>
        </div>
        
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
            {isLoading ? t("dashboard.generating") : t("dashboard.refreshInsights", { count: remainingManual })}
          </button>
        )}

        {phase === "exhausted" && insights && (
          <span className="text-xs text-muted-foreground/60 font-medium">
            {t("dashboard.refreshesTomorrow")}
          </span>
        )}
      </div>

      {phase === "exhausted" && !insights ? (
        <div className="p-4 rounded-md bg-muted/30 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary/60" />
            <span className="text-xs font-medium text-foreground">{t("dashboard.allCaughtUp")}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("dashboard.allCaughtUpDesc")}
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
               {t("dashboard.refreshingInsights")}
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
                  {t("dashboard.recommendedActions")}
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
