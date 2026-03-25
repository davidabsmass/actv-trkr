import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";
import { Calendar, TrendingUp, TrendingDown, Minus, Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { generateFindings, type InsightInputs } from "@/lib/insight-engine";

function TrendBadge({ change }: { change: number | null }) {
  if (change === null || change === undefined) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change > 0 ? "text-success" : change < 0 ? "text-destructive" : "text-muted-foreground"}`}>
      {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}

export default function WeeklyTab() {
  const { orgId } = useOrg();
  const { t } = useTranslation();
  const [aiParagraph, setAiParagraph] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [attemptedHydration, setAttemptedHydration] = useState(false);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["weekly_summary_reports", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = (await supabase
        .from("weekly_summaries")
        .select("*")
        .eq("org_id", orgId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle()) as { data: any; error: any };
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const hydrateWeeklySummary = async (silent = false) => {
    if (!orgId || isHydrating) return;

    setIsHydrating(true);
    try {
      const { error } = await supabase.functions.invoke("weekly-summary", {
        body: { org_id: orgId, source: "reports_weekly_tab" },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("Failed to hydrate weekly summary", error);
      if (!silent) {
        toast.error(t("reports.couldNotGenerate"));
      }
    } finally {
      setIsHydrating(false);
    }
  };

  useEffect(() => {
    if (!orgId || isLoading || summary || attemptedHydration || isHydrating) return;
    setAttemptedHydration(true);
    void hydrateWeeklySummary(true);
  }, [orgId, isLoading, summary, attemptedHydration, isHydrating]);

  const metrics = (summary?.conversion_anomalies ?? {}) as Record<string, number | string | null | undefined>;
  const sessionsCurrent = Number(metrics.sessions_current ?? 0);
  const sessionsPrevious = Number(metrics.sessions_previous ?? 0);
  const leadsCurrent = Number(metrics.leads_current ?? 0);
  const leadsPrevious = Number(metrics.leads_previous ?? 0);
  const cvrCurrent = Number(metrics.cvr_current ?? 0);
  const cvrPrevious = Number(metrics.cvr_previous ?? 0);
  const cvrChange = Number(metrics.cvr_change ?? 0);
  const topSource = (metrics.top_source as string | undefined) || "—";

  const [cooldownUntil, setCooldownUntil] = useState(0);
  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  const generateAiSummary = async () => {
    if (!summary) return;
    setLoadingAi(true);
    try {
      const inputs: InsightInputs = {
        currentSessions: sessionsCurrent,
        previousSessions: sessionsPrevious,
        currentLeads: leadsCurrent,
        previousLeads: leadsPrevious,
        currentCvr: cvrCurrent,
        previousCvr: cvrPrevious,
      };
      const findings = generateFindings(inputs);
      const { data: result, error } = await supabase.functions.invoke("reports-ai-copy", {
        body: { findings, report_type: "weekly" },
      });
      if (error) {
        if (error.message?.includes("429") || error.message?.includes("RATE_LIMITED")) {
          toast.error(t("reports.dailyLimitReached"));
          return;
        }
        throw error;
      }
      if (result?.code === "RATE_LIMITED") {
        toast.error(result.error || t("reports.dailyLimitReached"));
        return;
      }
      setAiParagraph(result?.summary_paragraph || null);
      setCooldownUntil(Date.now() + 30_000);
    } catch {
      toast.error(t("reports.failedWeekly"));
    } finally {
      setLoadingAi(false);
    }
  };

  if (isLoading || isHydrating) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">{t("reports.buildingWeekly")}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">{t("reports.noWeeklySummary")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("reports.clickToGenerate")}</p>
        <button
          onClick={() => void hydrateWeeklySummary(false)}
          disabled={isHydrating}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isHydrating ? "animate-spin" : ""}`} />
          {t("reports.generateWeeklySummary")}
        </button>
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
            <h3 className="text-sm font-semibold text-foreground">{t("reports.weekOf")} {format(new Date(summary.week_start), "MMM d, yyyy")}</h3>
          </div>
          <button
            onClick={generateAiSummary}
            disabled={loadingAi || cooldownRemaining > 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {loadingAi ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loadingAi ? t("reports.generatingAi") : cooldownRemaining > 0 ? t("reports.waitSeconds", { seconds: cooldownRemaining }) : t("reports.aiSummary")}
          </button>
        </div>

        {/* AI or stored summary */}
        <div className="p-4 rounded-md bg-primary/5 border border-primary/10 mb-4">
          <p className="text-sm text-foreground/80 leading-relaxed">{aiParagraph || summary.summary_text || t("reports.generateAiSummary")}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("reports.sessions"), value: sessionsCurrent, change: Number(summary.sessions_change) },
            { label: t("reports.leads"), value: leadsCurrent, change: Number(summary.leads_change) },
            { label: t("reports.cvr"), value: `${cvrCurrent}%`, change: cvrChange },
            { label: t("reports.topSource"), value: topSource, change: null },
          ].map((m) => (
            <div key={m.label} className="p-3 rounded-md bg-muted/50">
              <p className="text-xs uppercase text-muted-foreground tracking-wider mb-1">{m.label}</p>
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
            <p className="text-xs uppercase tracking-wider text-destructive font-medium mb-1">⚠️ {t("reports.riskAlert")}</p>
            <p className="text-sm text-foreground">{summary.risk_alert}</p>
          </div>
        )}
        {summary.top_opportunity && (
          <div className="rounded-lg border border-success/20 bg-success/5 p-4">
            <p className="text-xs uppercase tracking-wider text-success font-medium mb-1">🟢 {t("reports.topOpportunity")}</p>
            <p className="text-sm text-foreground">{summary.top_opportunity}</p>
          </div>
        )}
      </div>

      {/* Recommended Next Steps */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" /> {t("reports.recommendedNextSteps")}
        </h3>
        <div className="space-y-2">
          {Number(summary.leads_change) < -10 && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-xs font-bold text-primary mt-0.5">1.</span>
              <p className="text-foreground">{t("reports.reviewLeadSources")}</p>
            </div>
          )}
          {Number(summary.sessions_change) > 10 && Number(summary.leads_change) < 5 && (
            <div className="flex items-start gap-2 text-sm">
              <span className="text-xs font-bold text-primary mt-0.5">2.</span>
              <p className="text-foreground">{t("reports.trafficGrowNoLeads")}</p>
            </div>
          )}
          <div className="flex items-start gap-2 text-sm">
            <span className="text-xs font-bold text-primary mt-0.5">•</span>
            <p className="text-foreground">{t("reports.reviewOverviewTab")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
