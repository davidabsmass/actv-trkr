import { useTranslation } from "react-i18next";
import { useConversionMetrics, GOAL_TYPES } from "@/hooks/use-goals";
import { useOrg } from "@/hooks/use-org";
import { Target, TrendingUp, BarChart3, Info } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface Props {
  orgId: string | null;
  startDate: string;
  endDate: string;
}

export function ConversionBreakdown({ orgId, startDate, endDate }: Props) {
  const { t } = useTranslation();
  const { orgCreatedAt } = useOrg();
  const { data: metrics, isLoading } = useConversionMetrics(orgId, startDate, endDate, orgCreatedAt);

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-24 bg-muted rounded" />
      </div>
    );
  }

  if (!metrics) return null;

  const fmtPct = (v: number) => {
    const p = v * 100;
    if (p > 0 && p < 0.1) return p.toFixed(2) + "%";
    return p.toFixed(1) + "%";
  };

  const goalTypeLabel = (type: string) => {
    const gt = GOAL_TYPES.find((g) => g.value === type);
    return gt ? `${gt.icon} ${t(gt.labelKey)}` : type;
  };

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          {t("goals.conversionBreakdown")}
        </h3>
        <IconTooltip label={t("goals.cvrTooltip")}>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </IconTooltip>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("goals.conversionRateLabel")}</span>
          <p className="text-xl font-bold font-mono-data text-foreground mt-1">{fmtPct(metrics.conversionRate)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {metrics.hasCustomGoals ? t("goals.cvrDefinition") : t("goals.cvrFallback")}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("goals.formCvrLabel")}</span>
          <p className="text-xl font-bold font-mono-data text-foreground mt-1">{fmtPct(metrics.formCvr)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {metrics.totalLeads > metrics.formConversions
              ? `${metrics.formConversions} of ${metrics.totalLeads} ${t("goals.formSubmissions")}`
              : `${metrics.formConversions} ${t("goals.formSubmissions")}`}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("goals.goalCvrLabel")}</span>
          <p className="text-xl font-bold font-mono-data text-foreground mt-1">{fmtPct(metrics.goalCvr)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.goalConversions} {t("goals.goalCompletionsLabel")}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("goals.totalConversionsLabel")}</span>
          <p className="text-xl font-bold font-mono-data text-foreground mt-1">{metrics.totalConversions.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.sessions.toLocaleString()} {t("common.sessions")}</p>
        </div>
      </div>

      {/* Excluded-leads gap note — surfaces when imports / sessionless POSTs
          are skewing the picture so the user understands why CVR is lower
          than naive "leads ÷ sessions" math would suggest. */}
      {metrics.untrackedLeads > 0 && (
        <div className="mb-4 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("goals.untrackedLeadsExcluded", { count: metrics.untrackedLeads })}
          </p>
        </div>
      )}

      {/* Goal breakdown */}
      {metrics.goalBreakdown.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            {t("goals.conversionsByGoal")}
          </p>
          <div className="space-y-1.5">
            {metrics.goalBreakdown.map((g) => {
              const maxCount = metrics.goalBreakdown[0]?.count || 1;
              return (
                <div key={g.goalId} className="flex items-center gap-3">
                  <span className="text-xs text-foreground font-medium truncate w-[45%]">{g.goalName}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60"
                      style={{ width: `${(g.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono-data text-muted-foreground w-10 text-right">{g.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Type breakdown */}
      {metrics.typeBreakdown.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            {t("goals.byGoalType")}
          </p>
          <div className="flex flex-wrap gap-2">
            {metrics.typeBreakdown.map((tb) => (
              <div key={tb.type} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                <span className="text-foreground font-medium">{goalTypeLabel(tb.type)}</span>
                <span className="text-muted-foreground ml-1.5">({tb.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No goals message */}
      {!metrics.hasCustomGoals && (
        <div className="mt-3 rounded-lg border border-dashed border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("goals.noConversionGoals")}</p>
          <p className="text-xs text-muted-foreground">{t("goals.cvrFallbackExplainer")}</p>
        </div>
      )}
    </div>
  );
}
