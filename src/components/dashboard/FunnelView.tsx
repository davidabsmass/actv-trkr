import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface FunnelStep {
  label: string;
  value: number;
}

interface FunnelViewProps {
  totalPageviews: number;
  formPageViews: number;
  totalLeads: number;
  locked?: boolean;
}

export function FunnelView({ totalPageviews, formPageViews, totalLeads, locked }: FunnelViewProps) {
  const { t } = useTranslation();

  const steps: FunnelStep[] = useMemo(
    () => [
      { label: t("funnel.landingPageViews"), value: totalPageviews },
      { label: t("funnel.formPageViews"), value: formPageViews || Math.round(totalPageviews * 0.35) },
      { label: t("funnel.formSubmissions"), value: totalLeads },
    ],
    [totalPageviews, formPageViews, totalLeads, t]
  );

  if (locked) return null;

  const maxVal = steps[0]?.value || 1;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-foreground">{t("funnel.title")}</h3>
        <IconTooltip label="Visualizes the visitor journey from pageview to form submission to lead.">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </IconTooltip>
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const widthPct = Math.max((step.value / maxVal) * 100, 8);
          const dropOff = i > 0 ? ((steps[i - 1].value - step.value) / (steps[i - 1].value || 1)) * 100 : 0;

          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground font-mono-data">
                    {step.value.toLocaleString()}
                  </span>
                  {i > 0 && (
                    <span className="text-xs text-destructive font-medium">
                      -{dropOff.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-8 bg-muted rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    background: i === 0
                      ? "hsl(var(--primary))"
                      : dropOff > 80
                      ? "hsl(var(--destructive))"
                      : dropOff > 50
                      ? "hsl(var(--warning))"
                      : "hsl(var(--success))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
