import { useMemo } from "react";

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

interface FunnelWidgetProps {
  totalSessions: number;
  totalPageviews: number;
  totalLeads: number;
  formStarts?: number;
}

export function FunnelWidget({ totalSessions, totalPageviews, totalLeads, formStarts }: FunnelWidgetProps) {
  const steps = useMemo<FunnelStep[]>(() => {
    const s: FunnelStep[] = [
      { label: "Sessions", value: totalSessions, color: "bg-primary" },
      { label: "Pageviews", value: totalPageviews, color: "bg-accent" },
    ];
    if (formStarts !== undefined && formStarts > 0) {
      s.push({ label: "Form Starts", value: formStarts, color: "bg-warning" });
    }
    s.push({ label: "Leads", value: totalLeads, color: "bg-success" });
    return s;
  }, [totalSessions, totalPageviews, totalLeads, formStarts]);

  const maxValue = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-semibold text-foreground mb-4">Conversion Funnel</h3>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const pct = (step.value / maxValue) * 100;
          const dropoff = i > 0
            ? steps[i - 1].value > 0
              ? Math.round(((steps[i - 1].value - step.value) / steps[i - 1].value) * 100)
              : 0
            : null;

          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{step.label}</span>
                  {dropoff !== null && dropoff > 0 && (
                    <span className="text-xs text-muted-foreground">
                      −{dropoff}%
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono-data font-semibold text-foreground">
                  {step.value.toLocaleString()}
                </span>
              </div>
              <div className="h-6 bg-muted/30 rounded-md overflow-hidden relative">
                <div
                  className={`h-full ${step.color} rounded-md transition-all duration-700 ease-out`}
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    opacity: 0.7 + (0.3 * (1 - i / steps.length)),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {totalSessions > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Overall CVR</span>
            <span className="text-sm font-bold font-mono-data text-foreground">
              {totalSessions > 0 ? ((totalLeads / totalSessions) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
