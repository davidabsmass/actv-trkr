import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Target, Filter } from "lucide-react";

interface FunnelStep {
  label: string;
  value: number;
  color: string; // tailwind bg-* class for the dot
  fill: string;  // gradient/css for the meter fill
}

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

export function FunnelWidget({
  totalSessions,
  totalPageviews,
  totalLeads,
  formStarts,
  goalConversions,
}: FunnelWidgetProps) {
  const { t } = useTranslation();

  const steps = useMemo<FunnelStep[]>(() => {
    const s: FunnelStep[] = [
      { label: t("dashboard.sessions"), value: totalSessions, color: "bg-primary", fill: "var(--gradient-primary)" },
    ];
    if (formStarts !== undefined && formStarts > 0) {
      s.push({ label: t("dashboard.formStarts"), value: formStarts, color: "bg-warning", fill: "var(--gradient-warning)" });
    }
    s.push({ label: t("dashboard.leads"), value: totalLeads, color: "bg-success", fill: "var(--gradient-success)" });
    return s;
  }, [totalSessions, totalLeads, formStarts, t]);

  const goalSteps = useMemo<FunnelStep[]>(() => {
    if (!goalConversions || goalConversions.length === 0) return [];
    const TOKENS = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
    ];
    return goalConversions.map((g, i) => ({
      label: g.name,
      value: g.count,
      color: `bg-chart-${(i % 5) + 1}`,
      fill: `linear-gradient(90deg, ${TOKENS[i % TOKENS.length]}, ${TOKENS[(i + 1) % TOKENS.length]})`,
    }));
  }, [goalConversions]);

  const maxValue = Math.max(...steps.map((s) => s.value), 1);
  const overallCvr = totalSessions > 0 ? Math.min(100, (totalLeads / totalSessions) * 100) : 0;

  return (
    <div className="glass-card-elevated p-5 animate-slide-up h-full">
      <div className="panel-heading">
        <span className="icon-chip"><Filter className="h-4 w-4" /></span>
        <h3>{t("dashboard.conversionFunnel")}</h3>
      </div>

      <div className="space-y-3.5">
        {steps.map((step, i) => {
          const pct = (step.value / maxValue) * 100;
          const dropoffRaw =
            i > 0
              ? steps[i - 1].value > 0
                ? ((steps[i - 1].value - step.value) / steps[i - 1].value) * 100
                : 0
              : null;
          const dropoff =
            dropoffRaw !== null
              ? dropoffRaw >= 99.5 && dropoffRaw < 100
                ? parseFloat(dropoffRaw.toFixed(1))
                : Math.round(dropoffRaw)
              : null;
          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${step.color}`} />
                  <span className="text-xs font-semibold text-foreground">{step.label}</span>
                  {dropoff !== null && dropoff > 0 && (
                    <span
                      className="text-[10px] uppercase tracking-wider text-muted-foreground"
                      title={`${dropoff}% of visitors who reached "${steps[i - 1].label}" did not reach "${step.label}"`}
                    >
                      {dropoff}% drop-off
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono-data font-semibold text-foreground">
                  {step.value.toLocaleString()}
                </span>
              </div>
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{ width: `${pct}%`, background: step.fill }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Goal Conversions */}
      {goalSteps.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border/50">
          <div className="flex items-center gap-1.5 mb-3">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.goalConversions", "Goal Conversions")}
            </span>
          </div>
          <div className="space-y-3">
            {goalSteps.map((step) => {
              const goalMax = Math.max(...goalSteps.map((g) => g.value), 1);
              const pct = (step.value / goalMax) * 100;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full ${step.color} shrink-0`} />
                      <span className="text-xs font-medium text-foreground truncate">{step.label}</span>
                    </div>
                    <span className="text-xs font-mono-data font-semibold text-foreground">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill" style={{ width: `${pct}%`, background: step.fill }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalSessions > 0 && (
        <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
            {t("dashboard.overallCvr")}
          </span>
          <span className="text-base font-bold font-mono-data text-gradient-primary">
            {overallCvr.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
