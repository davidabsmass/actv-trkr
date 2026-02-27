import { useMemo } from "react";
import { Lock } from "lucide-react";

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
  const steps: FunnelStep[] = useMemo(
    () => [
      { label: "Landing Page Views", value: totalPageviews },
      { label: "Form Page Views", value: formPageViews || Math.round(totalPageviews * 0.35) },
      { label: "Form Submissions", value: totalLeads },
    ],
    [totalPageviews, formPageViews, totalLeads]
  );

  if (locked) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Conversion Funnel</h3>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            <Lock className="h-3 w-3" /> Growth Plan
          </span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Lock className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Upgrade to Growth to access the conversion funnel view.</p>
        </div>
      </div>
    );
  }

  const maxVal = steps[0]?.value || 1;

  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-5">Conversion Funnel</h3>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const widthPct = Math.max((step.value / maxVal) * 100, 8);
          const dropOff = i > 0 ? ((steps[i - 1].value - step.value) / (steps[i - 1].value || 1)) * 100 : 0;

          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground font-mono-data">
                    {step.value.toLocaleString()}
                  </span>
                  {i > 0 && (
                    <span className="text-[10px] text-destructive font-medium">
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
                      : i === 1
                      ? "hsl(var(--chart-6))"
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
