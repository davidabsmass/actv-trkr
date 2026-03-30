import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";

interface FunnelStep { label: string; value: number; color: string; }

export interface GoalFunnelEntry {
  name: string;
  count: number;
}

interface FunnelWidgetProps {
  totalSessions: number;
  totalPageviews: number;
  totalLeads: number;
  formStarts?: number;
  goalConversions?: GoalFunnelEntry[];
}

export function FunnelWidget({ totalSessions, totalPageviews, totalLeads, formStarts, goalConversions }: FunnelWidgetProps) {
  const { t } = useTranslation();

  const steps = useMemo<FunnelStep[]>(() => {
    const s: FunnelStep[] = [
      { label: t("dashboard.sessions"), value: totalSessions, color: "bg-primary" },
    ];
    if (formStarts !== undefined && formStarts > 0) {
      s.push({ label: t("dashboard.formStarts"), value: formStarts, color: "bg-warning" });
    }
    s.push({ label: t("dashboard.leads"), value: totalLeads, color: "bg-success" });
    return s;
  }, [totalSessions, totalLeads, formStarts, t]);

  const goalSteps = useMemo<FunnelStep[]>(() => {
    if (!goalConversions || goalConversions.length === 0) return [];
    const GOAL_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
    return goalConversions.map((g, i) => ({
      label: g.name,
      value: g.count,
      color: GOAL_COLORS[i % GOAL_COLORS.length],
    }));
  }, [goalConversions]);

  const maxValue = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-semibold text-foreground mb-4">{t("dashboard.conversionFunnel")}</h3>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const pct = (step.value / maxValue) * 100;
          const dropoffRaw = i > 0 ? steps[i - 1].value > 0 ? ((steps[i - 1].value - step.value) / steps[i - 1].value) * 100 : 0 : null;
          const dropoff = dropoffRaw !== null ? (dropoffRaw >= 99.5 && dropoffRaw < 100 ? parseFloat(dropoffRaw.toFixed(1)) : Math.round(dropoffRaw)) : null;
          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{step.label}</span>
                  
                </div>
                <span className="text-xs font-mono-data font-semibold text-foreground">{step.value.toLocaleString()}</span>
              </div>
              <div className="h-6 bg-muted/30 rounded-md overflow-hidden relative">
                <div className={`h-full ${step.color} rounded-md transition-all duration-700 ease-out`} style={{ width: `${Math.max(pct, 2)}%`, opacity: 0.7 + (0.3 * (1 - i / steps.length)) }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Goal Conversions as separate funnel entries */}
      {goalSteps.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="flex items-center gap-1.5 mb-3">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.goalConversions", "Goal Conversions")}
            </span>
          </div>
          <div className="space-y-3">
            {goalSteps.map((step) => {
              const goalMax = Math.max(...goalSteps.map(g => g.value), 1);
              const pct = (step.value / goalMax) * 100;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{step.label}</span>
                    <span className="text-xs font-mono-data font-semibold text-foreground">{step.value.toLocaleString()}</span>
                  </div>
                  <div className="h-5 bg-muted/30 rounded-md overflow-hidden relative">
                    <div className={`h-full ${step.color} rounded-md transition-all duration-700 ease-out opacity-75`} style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalSessions > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("dashboard.overallCvr")}</span>
            <span className="text-sm font-bold font-mono-data text-foreground">{totalSessions > 0 ? ((totalLeads / totalSessions) * 100).toFixed(1) : "0.0"}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
